'use strict';

/**
 * Erro genérico retornado pela Riot API.
 */
class RiotApiError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'RiotApiError';
    this.status = options.status ?? null;
    this.endpoint = options.endpoint ?? null;
    this.responseBody = options.responseBody ?? null;
  }
}

/**
 * Erro específico para HTTP 429.
 * `retryAfterSeconds` informa quando uma nova tentativa pode ser feita.
 */
class RiotRateLimitError extends RiotApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'RiotRateLimitError';
    this.retryAfterSeconds = options.retryAfterSeconds ?? 1;
    this.rateLimitType = options.rateLimitType ?? null;
    this.retryAt = new Date(Date.now() + this.retryAfterSeconds * 1000);
  }
}

class RiotPreGameController {
  /**
   * @param {object} options
   * @param {string} options.apiKey Chave da Riot API.
   * @param {string} [options.regionalRoute='americas'] Rota do Account-V1.
   * @param {string} [options.platformRoute='br1'] Rota do League-V4.
   * @param {number} [options.timeoutMs=10000] Timeout de cada requisição.
   * @param {number} [options.maxRateLimitRetries=1] Tentativas extras após um 429.
   * @param {(error: RiotRateLimitError) => void} [options.onRateLimit]
   * @param {typeof fetch} [options.fetchImpl=globalThis.fetch] Útil para testes.
   */
  constructor({
    apiKey,
    regionalRoute = 'americas',
    platformRoute = 'br1',
    timeoutMs = 10_000,
    maxRateLimitRetries = 1,
    onRateLimit,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new TypeError('Informe uma Riot API Key válida.');
    }

    if (typeof fetchImpl !== 'function') {
      throw new TypeError(
        'fetch não está disponível. Use Node.js 18+ ou injete fetchImpl.',
      );
    }

    this.apiKey = apiKey;
    this.regionalRoute = regionalRoute.toLowerCase();
    this.platformRoute = platformRoute.toLowerCase();
    this.timeoutMs = timeoutMs;
    this.maxRateLimitRetries = Math.max(0, maxRateLimitRetries);
    this.onRateLimit = onRateLimit;
    this.fetch = fetchImpl;
  }

  /**
   * Resolve GameName + TagLine para uma conta contendo o PUUID.
   */
  async getAccountByRiotId(gameName, tagLine) {
    this._assertNonEmptyString(gameName, 'gameName');
    this._assertNonEmptyString(tagLine, 'tagLine');

    const endpoint =
      `https://${this.regionalRoute}.api.riotgames.com` +
      '/riot/account/v1/accounts/by-riot-id/' +
      `${encodeURIComponent(gameName.trim())}/${encodeURIComponent(tagLine.trim())}`;

    return this._requestJson(endpoint);
  }

  /**
   * Retorna todas as filas ranqueadas disponíveis para o PUUID.
   */
  async getRankedEntriesByPuuid(puuid) {
    this._assertNonEmptyString(puuid, 'puuid');

    const endpoint =
      `https://${this.platformRoute}.api.riotgames.com` +
      '/lol/league/v4/entries/by-puuid/' +
      encodeURIComponent(puuid.trim());

    const entries = await this._requestJson(endpoint);
    return Array.isArray(entries) ? entries : [];
  }

  /**
   * Fluxo completo para uso pré-jogo.
   * Retorna a conta, todas as filas e atalhos para Solo/Duo e Flex.
   */
  async getPlayerPreGameInfo(gameName, tagLine) {
    try {
      const account = await this.getAccountByRiotId(gameName, tagLine);
      const rawEntries = await this.getRankedEntriesByPuuid(account.puuid);
      const ranks = rawEntries.map((entry) => this._formatRankedEntry(entry));

      return {
        account: {
          puuid: account.puuid,
          gameName: account.gameName,
          tagLine: account.tagLine,
        },
        ranks,
        soloQueue:
          ranks.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ?? null,
        flexQueue:
          ranks.find((entry) => entry.queueType === 'RANKED_FLEX_SR') ?? null,
      };
    } catch (error) {
      if (error instanceof RiotRateLimitError) {
        // Aqui você pode repassar `retryAfterSeconds` ao renderer via IPC.
        throw error;
      }

      if (error instanceof RiotApiError) {
        throw error;
      }

      throw new RiotApiError('Falha ao buscar os dados pré-jogo.', {
        cause: error,
      });
    }
  }

  async _requestJson(endpoint, attempt = 0) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Riot-Token': this.apiKey,
        },
        signal: controller.signal,
      });

      const responseBody = await this._readResponseBody(response);

      if (response.status === 429) {
        const retryAfterSeconds = this._parseRetryAfter(
          response.headers.get('retry-after'),
        );

        const rateLimitError = new RiotRateLimitError(
          `Limite da Riot API atingido. Tente novamente em ${retryAfterSeconds}s.`,
          {
            status: response.status,
            endpoint,
            responseBody,
            retryAfterSeconds,
            rateLimitType: response.headers.get('x-rate-limit-type'),
          },
        );

        this.onRateLimit?.(rateLimitError);

        if (attempt < this.maxRateLimitRetries) {
          await this._delay(retryAfterSeconds * 1000);
          return this._requestJson(endpoint, attempt + 1);
        }

        throw rateLimitError;
      }

      if (!response.ok) {
        throw new RiotApiError(
          this._getHttpErrorMessage(response.status, responseBody),
          {
            status: response.status,
            endpoint,
            responseBody,
          },
        );
      }

      return responseBody;
    } catch (error) {
      if (error instanceof RiotApiError) {
        throw error;
      }

      if (error?.name === 'AbortError') {
        throw new RiotApiError(
          `A Riot API não respondeu em até ${this.timeoutMs}ms.`,
          { endpoint, cause: error },
        );
      }

      throw new RiotApiError('Erro de rede ao acessar a Riot API.', {
        endpoint,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async _readResponseBody(response) {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      // A Riot não garante JSON no corpo de respostas diferentes de HTTP 200.
      return text;
    }
  }

  _formatRankedEntry(entry) {
    const wins = Number(entry.wins ?? 0);
    const losses = Number(entry.losses ?? 0);
    const totalGames = wins + losses;

    return {
      queueType: entry.queueType,
      tier: entry.tier ?? null,
      rank: entry.rank ?? null,
      leaguePoints: Number(entry.leaguePoints ?? 0),
      wins,
      losses,
      winRate:
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0,
      veteran: Boolean(entry.veteran),
      inactive: Boolean(entry.inactive),
      freshBlood: Boolean(entry.freshBlood),
      hotStreak: Boolean(entry.hotStreak),
      miniSeries: entry.miniSeries ?? null,
    };
  }

  _parseRetryAfter(value) {
    const seconds = Number.parseInt(value, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : 1;
  }

  _getHttpErrorMessage(status, body) {
    const messages = {
      400: 'Requisição inválida enviada à Riot API.',
      401: 'Riot API Key ausente.',
      403: 'Riot API Key inválida, expirada ou sem permissão.',
      404: 'Jogador ou dados ranqueados não encontrados.',
      500: 'Erro interno da Riot API.',
      503: 'Riot API temporariamente indisponível.',
    };

    const apiMessage =
      body && typeof body === 'object' ? body.status?.message : null;

    return apiMessage || messages[status] || `Riot API retornou HTTP ${status}.`;
  }

  _assertNonEmptyString(value, fieldName) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`${fieldName} deve ser uma string não vazia.`);
    }
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  RiotPreGameController,
  RiotApiError,
  RiotRateLimitError,
};

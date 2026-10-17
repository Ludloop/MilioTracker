const fs = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");

const { findInstallPathFromRiotMetadata } = require("./lol-settings");

const RANKED_QUEUE_PRIORITY = ["RANKED_SOLO_5x5", "RANKED_FLEX_SR"];
const QUEUE_LABELS = {
  RANKED_SOLO_5x5: "Solo/Duo",
  RANKED_FLEX_SR: "Flex"
};
const TIER_LABELS = {
  IRON: "Ferro",
  BRONZE: "Bronze",
  SILVER: "Prata",
  GOLD: "Ouro",
  PLATINUM: "Platina",
  EMERALD: "Esmeralda",
  DIAMOND: "Diamante",
  MASTER: "Mestre",
  GRANDMASTER: "Grão-Mestre",
  CHALLENGER: "Desafiante"
};

function parseLeagueLockfile(content) {
  const parts = String(content).trim().split(":");
  if (parts.length !== 5) throw new Error("O lockfile do League está inválido.");

  const [processName, pidValue, portValue, password, protocol] = parts;
  const pid = Number.parseInt(pidValue, 10);
  const port = Number.parseInt(portValue, 10);

  if (!processName || !Number.isInteger(pid) || !Number.isInteger(port) || !password) {
    throw new Error("O lockfile do League está incompleto.");
  }

  return {
    processName,
    pid,
    port,
    password,
    protocol: protocol || "https"
  };
}

async function getLockfileCandidates() {
  const candidates = [];
  if (process.env.LEAGUE_CLIENT_LOCKFILE) {
    candidates.push(process.env.LEAGUE_CLIENT_LOCKFILE);
  }

  const metadataInstallPath = await findInstallPathFromRiotMetadata();
  if (metadataInstallPath) candidates.push(path.win32.join(metadataInstallPath, "lockfile"));

  const systemDrive = process.env.SystemDrive || "C:";
  candidates.push(path.win32.join(systemDrive, "Riot Games", "League of Legends", "lockfile"));

  if (process.env.ProgramFiles) {
    candidates.push(
      path.win32.join(process.env.ProgramFiles, "Riot Games", "League of Legends", "lockfile")
    );
  }

  return [...new Set(candidates.map((candidate) => path.normalize(candidate)))];
}

async function readLeagueClientCredentials() {
  const candidates = await getLockfileCandidates();

  for (const lockfilePath of candidates) {
    try {
      const content = await fs.readFile(lockfilePath, "utf8");
      return { ...parseLeagueLockfile(content), lockfilePath };
    } catch {
      // Tenta o próximo caminho de instalação conhecido.
    }
  }

  throw new Error("Abra o League of Legends e faça login para o MilioTracker detectar a conta.");
}

function requestLeagueClient(endpoint, credentials, { timeoutMs = 3000 } = {}) {
  const authorization = Buffer.from(`riot:${credentials.password}`).toString("base64");

  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: "127.0.0.1",
        port: credentials.port,
        path: endpoint,
        method: "GET",
        rejectUnauthorized: false,
        timeout: timeoutMs,
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${authorization}`
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("error", reject);
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`League Client respondeu ${response.statusCode}.`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("O League Client retornou dados JSON inválidos."));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Tempo limite ao consultar a conta logada."));
    });
    request.on("error", reject);
  });
}

function splitRiotId(displayName) {
  const value = String(displayName || "").trim();
  const separatorIndex = value.lastIndexOf("#");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return { gameName: value || null, tagLine: null };
  }

  return {
    gameName: value.slice(0, separatorIndex),
    tagLine: value.slice(separatorIndex + 1)
  };
}

function normalizeLoggedAccount(summoner, userInfo = null) {
  if (!summoner?.puuid) throw new Error("Nenhuma conta conectada foi encontrada no League Client.");

  const fallbackRiotId = splitRiotId(summoner.riotId || summoner.displayName);
  const accountClaims = userInfo?.acct || userInfo?.account || {};
  const gameName =
    summoner.gameName ||
    accountClaims.game_name ||
    accountClaims.gameName ||
    fallbackRiotId.gameName;
  const tagLine =
    summoner.tagLine ||
    accountClaims.tag_line ||
    accountClaims.tagLine ||
    fallbackRiotId.tagLine;

  return {
    puuid: summoner.puuid,
    gameName: gameName || null,
    tagLine: tagLine || null,
    riotId: gameName && tagLine ? `${gameName}#${tagLine}` : gameName || null,
    summonerId: summoner.summonerId ?? null,
    profileIconId: summoner.profileIconId ?? null,
    summonerLevel: summoner.summonerLevel ?? null
  };
}

function getRankedQueue(stats, queueType) {
  const fromMap = stats?.queueMap?.[queueType];
  if (fromMap) return { ...fromMap, queueType: fromMap.queueType || queueType };

  const queues = Array.isArray(stats?.queues) ? stats.queues : [];
  return queues.find((queue) => queue?.queueType === queueType) || null;
}

function isRankedQueue(queue) {
  const tier = String(queue?.tier || "").toUpperCase();
  return Boolean(tier && tier !== "NONE" && tier !== "UNRANKED" && tier !== "NA");
}

function normalizeRankedStats(stats) {
  const queues = RANKED_QUEUE_PRIORITY.map((queueType) =>
    getRankedQueue(stats, queueType)
  ).filter(Boolean);
  const selectedQueue = queues.find(isRankedQueue) || queues[0] || null;
  const queueType = selectedQueue?.queueType || RANKED_QUEUE_PRIORITY[0];
  const queueLabel = QUEUE_LABELS[queueType] || queueType;

  if (!isRankedQueue(selectedQueue)) {
    return {
      ranked: false,
      queueType,
      queueLabel,
      tier: "UNRANKED",
      tierLabel: "Sem classificação",
      division: null,
      leaguePoints: 0,
      wins: 0,
      losses: 0,
      label: "Sem classificação"
    };
  }

  const tier = String(selectedQueue.tier).toUpperCase();
  const divisionValue = selectedQueue.division || selectedQueue.rank;
  const division = divisionValue ? String(divisionValue).toUpperCase() : null;
  const tierLabel = TIER_LABELS[tier] || tier;
  const leaguePoints = Math.max(0, Number(selectedQueue.leaguePoints) || 0);

  return {
    ranked: true,
    queueType,
    queueLabel,
    tier,
    tierLabel,
    division,
    leaguePoints,
    wins: Math.max(0, Number(selectedQueue.wins) || 0),
    losses: Math.max(0, Number(selectedQueue.losses) || 0),
    label: division ? `${tierLabel} ${division}` : tierLabel
  };
}

async function getLoggedInLeagueAccount() {
  const credentials = await readLeagueClientCredentials();
  const summoner = await requestLeagueClient("/lol-summoner/v1/current-summoner", credentials);
  let userInfo = null;

  try {
    userInfo = await requestLeagueClient("/riot-client-account/v1/user/info", credentials);
  } catch {
    // O PUUID e, nas versões atuais, o Riot ID já vêm de current-summoner.
  }

  return normalizeLoggedAccount(summoner, userInfo);
}

async function getLoggedInLeagueRank() {
  const credentials = await readLeagueClientCredentials();
  let stats;

  try {
    stats = await requestLeagueClient("/lol-ranked/v1/current-ranked-stats", credentials);
  } catch (currentRankError) {
    const summoner = await requestLeagueClient(
      "/lol-summoner/v1/current-summoner",
      credentials
    );

    if (!summoner?.puuid) throw currentRankError;

    stats = await requestLeagueClient(
      `/lol-ranked/v1/ranked-stats/${encodeURIComponent(summoner.puuid)}`,
      credentials
    );
  }

  return normalizeRankedStats(stats);
}

module.exports = {
  getLockfileCandidates,
  getLoggedInLeagueAccount,
  getLoggedInLeagueRank,
  normalizeLoggedAccount,
  normalizeRankedStats,
  parseLeagueLockfile,
  readLeagueClientCredentials,
  requestLeagueClient,
  splitRiotId
};

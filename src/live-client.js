const https = require("node:https");

const LIVE_CLIENT_HOST = "127.0.0.1";
const LIVE_CLIENT_PORT = 2999;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/**
 * Consulta a API local que o processo do jogo expõe apenas durante uma partida.
 * rejectUnauthorized=false é intencional: o certificado HTTPS local é autoassinado.
 */
function requestLiveClient(endpoint, { timeoutMs = 2500 } = {}) {
  const safeEndpoint = String(endpoint).replace(/^\/+/, "");

  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: LIVE_CLIENT_HOST,
        port: LIVE_CLIENT_PORT,
        path: `/liveclientdata/${safeEndpoint}`,
        method: "GET",
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      (response) => {
        let body = "";
        let receivedBytes = 0;

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          receivedBytes += Buffer.byteLength(chunk);

          if (receivedBytes > MAX_RESPONSE_BYTES) {
            response.destroy(new Error("A resposta da Live Client API excedeu o limite."));
            return;
          }

          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Live Client respondeu ${response.statusCode}.`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("O League retornou dados JSON inválidos."));
          }
        });
        response.on("error", reject);
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Tempo limite ao consultar o League."));
    });
    request.on("error", reject);
  });
}

function normalizeIdentity(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US");
}

function getPlayerIdentities(player) {
  const identities = [
    player?.riotId,
    player?.summonerName,
    player?.riotIdGameName && player?.riotIdTagLine
      ? `${player.riotIdGameName}#${player.riotIdTagLine}`
      : null
  ]
    .map(normalizeIdentity)
    .filter(Boolean);

  return new Set(identities);
}

function resolveActivePlayerSide(activePlayer, playerList) {
  if (!activePlayer || !Array.isArray(playerList)) return null;

  const activeIdentities = getPlayerIdentities(activePlayer);
  const localPlayer = playerList.find((player) => {
    const playerIdentities = getPlayerIdentities(player);
    return [...activeIdentities].some((identity) => playerIdentities.has(identity));
  });

  if (!localPlayer || !["ORDER", "CHAOS"].includes(localPlayer.team)) return null;

  return {
    side: localPlayer.team === "ORDER" ? "blue" : "red",
    team: localPlayer.team,
    playerName:
      localPlayer.riotId ||
      localPlayer.summonerName ||
      activePlayer.riotId ||
      activePlayer.summonerName ||
      null
  };
}

async function fetchActivePlayerSide() {
  const [activePlayer, playerList] = await Promise.all([
    requestLiveClient("activeplayer"),
    requestLiveClient("playerlist")
  ]);

  return resolveActivePlayerSide(activePlayer, playerList);
}

module.exports = {
  fetchActivePlayerSide,
  getPlayerIdentities,
  normalizeIdentity,
  requestLiveClient,
  resolveActivePlayerSide
};

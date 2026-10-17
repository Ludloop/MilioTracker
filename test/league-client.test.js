const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeLoggedAccount,
  normalizeRankedStats,
  parseLeagueLockfile,
  splitRiotId
} = require("../src/league-client");

test("lê as credenciais do lockfile do League", () => {
  assert.deepEqual(parseLeagueLockfile("LeagueClient:1234:54321:senha:https"), {
    processName: "LeagueClient",
    pid: 1234,
    port: 54321,
    password: "senha",
    protocol: "https"
  });
});

test("normaliza o ELO Solo/Duo em português", () => {
  assert.deepEqual(
    normalizeRankedStats({
      queueMap: {
        RANKED_SOLO_5x5: {
          queueType: "RANKED_SOLO_5x5",
          tier: "GOLD",
          division: "III",
          leaguePoints: 2,
          wins: 18,
          losses: 14
        }
      }
    }),
    {
      ranked: true,
      queueType: "RANKED_SOLO_5x5",
      queueLabel: "Solo/Duo",
      tier: "GOLD",
      tierLabel: "Ouro",
      division: "III",
      leaguePoints: 2,
      wins: 18,
      losses: 14,
      label: "Ouro III"
    }
  );
});

test("usa o ELO Flex quando Solo/Duo ainda não está classificado", () => {
  const rank = normalizeRankedStats({
    queueMap: {
      RANKED_SOLO_5x5: { tier: "NONE", queueType: "RANKED_SOLO_5x5" },
      RANKED_FLEX_SR: {
        tier: "EMERALD",
        division: "IV",
        leaguePoints: 37,
        queueType: "RANKED_FLEX_SR"
      }
    }
  });

  assert.equal(rank.label, "Esmeralda IV");
  assert.equal(rank.queueLabel, "Flex");
  assert.equal(rank.leaguePoints, 37);
});

test("informa quando a conta não possui classificação", () => {
  const rank = normalizeRankedStats({ queueMap: {} });

  assert.equal(rank.ranked, false);
  assert.equal(rank.label, "Sem classificação");
  assert.equal(rank.queueLabel, "Solo/Duo");
});

test("separa gameName e tagLine de um Riot ID", () => {
  assert.deepEqual(splitRiotId("Mononoke#Lobo"), {
    gameName: "Mononoke",
    tagLine: "Lobo"
  });
});

test("normaliza a conta atual sem constantes fixas", () => {
  assert.deepEqual(
    normalizeLoggedAccount({
      puuid: "puuid-123",
      gameName: "NovaConta",
      tagLine: "BR1",
      summonerId: 10
    }),
    {
      puuid: "puuid-123",
      gameName: "NovaConta",
      tagLine: "BR1",
      riotId: "NovaConta#BR1",
      summonerId: 10,
      profileIconId: null,
      summonerLevel: null
    }
  );
});

test("usa as claims da sessão quando current-summoner não traz a tag", () => {
  const account = normalizeLoggedAccount(
    { puuid: "puuid-456", displayName: "ContaNova" },
    { acct: { game_name: "ContaNova", tag_line: "BR1" } }
  );

  assert.equal(account.riotId, "ContaNova#BR1");
  assert.equal(account.gameName, "ContaNova");
  assert.equal(account.tagLine, "BR1");
});

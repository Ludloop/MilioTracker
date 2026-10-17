const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveActivePlayerSide } = require("../src/live-client");

test("detecta ORDER como lado azul usando Riot ID", () => {
  const result = resolveActivePlayerSide(
    { riotId: "Lud#BR1", summonerName: "Lud#BR1" },
    [
      { riotId: "Outro#BR1", team: "CHAOS" },
      { riotId: "Lud#BR1", team: "ORDER" }
    ]
  );

  assert.deepEqual(result, {
    side: "blue",
    team: "ORDER",
    playerName: "Lud#BR1"
  });
});

test("detecta CHAOS como lado vermelho usando os campos separados do Riot ID", () => {
  const result = resolveActivePlayerSide(
    { riotIdGameName: "Lud", riotIdTagLine: "Milio" },
    [{ riotId: "lud#Milio", team: "CHAOS" }]
  );

  assert.equal(result.side, "red");
  assert.equal(result.team, "CHAOS");
});

test("retorna null quando o jogador ativo não aparece na lista", () => {
  assert.equal(
    resolveActivePlayerSide({ riotId: "Lud#BR1" }, [{ riotId: "Outro#BR1", team: "ORDER" }]),
    null
  );
});

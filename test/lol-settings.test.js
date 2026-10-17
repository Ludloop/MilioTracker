const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeMinimapScale,
  parseGameCfg,
  parsePersistedSettings
} = require("../src/lol-settings");

test("lê MinimapScale do PersistedSettings.json", () => {
  const json = JSON.stringify({
    files: [
      {
        sections: [
          {
            name: "HUD",
            settings: [{ name: "MinimapScale", value: "0.7500" }]
          }
        ]
      }
    ]
  });

  assert.equal(parsePersistedSettings(json), 0.75);
});

test("lê MinimapScale do game.cfg", () => {
  assert.equal(parseGameCfg("[HUD]\nMinimapScale=0.8500\nGlobalScale=0.5"), 0.85);
});

test("normaliza valores percentuais", () => {
  assert.equal(normalizeMinimapScale("75"), 0.75);
});

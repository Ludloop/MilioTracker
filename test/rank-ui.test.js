const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

test("o painel mantém o card de ELO e seus campos dinâmicos", () => {
  const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

  for (const id of ["rank-card", "rank-value", "rank-queue", "rank-account", "rank-pdl"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("o renderer consulta e atualiza o ELO automaticamente", () => {
  const renderer = fs.readFileSync(path.join(projectRoot, "renderer.js"), "utf8");
  const preload = fs.readFileSync(path.join(projectRoot, "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(projectRoot, "main.js"), "utf8");

  assert.match(renderer, /window\.milioAPI\.getRank\(\)/);
  assert.match(renderer, /setInterval\(updateRankData, 30000\)/);
  assert.match(preload, /ipcRenderer\.invoke\("lol:get-rank"\)/);
  assert.match(main, /ipcMain\.handle\("lol:get-rank"/);
});

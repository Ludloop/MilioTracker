const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const assetsDirectory = path.join(__dirname, "..", "assets");

function readAsset(fileName) {
  return fs.readFileSync(path.join(assetsDirectory, fileName), "utf8");
}

function assertCoordinates(svg, coordinates) {
  coordinates.forEach(([x, y]) => {
    assert.match(svg, new RegExp(`translate\\(${x * 10} ${y * 10}\\)`));
  });
}

test("camada azul replica os sete pontos da etapa 03", () => {
  const svg = readAsset("wards-blue.svg");
  assertCoordinates(svg, [
    [57, 74], [63, 84], [76, 83], [82, 67], [75, 60], [87, 57], [70, 66]
  ]);
  assert.equal((svg.match(/href="#pink"/g) || []).length, 2);
  assert.equal((svg.match(/href="#ward"/g) || []).length, 5);
});

test("camada vermelha replica os sete pontos da etapa 03", () => {
  const svg = readAsset("wards-red.svg");
  assertCoordinates(svg, [
    [85, 57], [84, 75], [76, 83], [80, 65], [79, 57], [59, 71], [70, 66]
  ]);
  assert.equal((svg.match(/href="#pink"/g) || []).length, 2);
  assert.equal((svg.match(/href="#ward"/g) || []).length, 5);
});

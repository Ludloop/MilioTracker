const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateMinimapBounds } = require("../src/minimap-layout");

test("posiciona o minimapa no canto inferior direito em 1920x1080", () => {
  const bounds = calculateMinimapBounds(
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    1,
    { referenceHeight: 1080, referenceMinimapSize: 250 }
  );

  assert.deepEqual(bounds, { x: 1670, y: 830, width: 250, height: 250 });
});

test("aplica resolução, MinimapScale, offsets e origem do monitor", () => {
  const bounds = calculateMinimapBounds(
    { bounds: { x: 1920, y: 0, width: 2560, height: 1440 } },
    0.75,
    {
      referenceHeight: 1080,
      referenceMinimapSize: 250,
      rightOffset: 6,
      bottomOffset: 3
    }
  );

  assert.deepEqual(bounds, { x: 4222, y: 1186, width: 250, height: 250 });
});

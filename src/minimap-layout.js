const DEFAULT_MINIMAP_CALIBRATION = Object.freeze({
  referenceHeight: 1080,
  referenceMinimapSize: 250,
  scaleMultiplier: 1,
  rightOffset: 0,
  bottomOffset: 0
});

function finiteOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeCalibration(calibration = {}) {
  return {
    referenceHeight: Math.max(
      1,
      finiteOr(calibration.referenceHeight, DEFAULT_MINIMAP_CALIBRATION.referenceHeight)
    ),
    referenceMinimapSize: Math.max(
      1,
      finiteOr(
        calibration.referenceMinimapSize,
        DEFAULT_MINIMAP_CALIBRATION.referenceMinimapSize
      )
    ),
    scaleMultiplier: Math.max(
      0.1,
      finiteOr(calibration.scaleMultiplier, DEFAULT_MINIMAP_CALIBRATION.scaleMultiplier)
    ),
    rightOffset: finiteOr(calibration.rightOffset, DEFAULT_MINIMAP_CALIBRATION.rightOffset),
    bottomOffset: finiteOr(
      calibration.bottomOffset,
      DEFAULT_MINIMAP_CALIBRATION.bottomOffset
    )
  };
}

/**
 * BrowserWindow usa DIP (device-independent pixels), assim como display.bounds.
 *
 * resolutionFactor = alturaAtual / alturaDeReferência
 * tamanho = tamanhoBaseEm1080p × resolutionFactor × MinimapScale × calibração
 * x = bordaDireitaDoMonitor - tamanho - offsetDireito
 * y = bordaInferiorDoMonitor - tamanho - offsetInferior
 */
function calculateMinimapBounds(display, minimapScale, rawCalibration = {}) {
  if (!display?.bounds) throw new TypeError("Display inválido para calcular o minimapa.");

  const calibration = sanitizeCalibration(rawCalibration);
  const displayBounds = display.bounds;
  const safeScale = Math.min(2, Math.max(0.25, finiteOr(minimapScale, 1)));
  const resolutionFactor = displayBounds.height / calibration.referenceHeight;
  const size = Math.max(
    1,
    Math.round(
      calibration.referenceMinimapSize *
        resolutionFactor *
        safeScale *
        calibration.scaleMultiplier
    )
  );
  const scaledRightOffset = Math.round(calibration.rightOffset * resolutionFactor);
  const scaledBottomOffset = Math.round(calibration.bottomOffset * resolutionFactor);

  return {
    width: size,
    height: size,
    x: Math.round(displayBounds.x + displayBounds.width - size - scaledRightOffset),
    y: Math.round(displayBounds.y + displayBounds.height - size - scaledBottomOffset)
  };
}

module.exports = {
  DEFAULT_MINIMAP_CALIBRATION,
  calculateMinimapBounds,
  sanitizeCalibration
};

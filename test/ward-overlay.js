const wardLayer = document.getElementById("ward-layer");

const layerBySide = Object.freeze({
  blue: "assets/wards-blue.svg",
  red: "assets/wards-red.svg"
});

function renderWardState(state) {
  const imagePath = layerBySide[state?.side];
  const connected = Boolean(state?.connected && imagePath);

  document.body.classList.toggle("is-connected", connected);
  document.body.dataset.side = connected ? state.side : "unknown";

  if (connected && wardLayer.getAttribute("src") !== imagePath) {
    wardLayer.setAttribute("src", imagePath);
  }
}

window.wardOverlayAPI.onStateChanged(renderWardState);
window.wardOverlayAPI
  .getState()
  .then(renderWardState)
  .catch(() => renderWardState({ connected: false }));

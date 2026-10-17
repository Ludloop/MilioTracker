const tempoPartida = document.getElementById("tempo-partida");
const ouroAtual = document.getElementById("ouro-atual");
const nivelAtual = document.getElementById("nivel-atual");
const statusPartida = document.getElementById("status-partida");
const rankCard = document.getElementById("rank-card");
const rankValue = document.getElementById("rank-value");
const rankQueue = document.getElementById("rank-queue");
const rankAccount = document.getElementById("rank-account");
const rankPdl = document.getElementById("rank-pdl");
const minimizeButton = document.getElementById("minimize-button");
const lockPositionButton = document.getElementById("lock-position-button");
const lockPositionIcon = document.getElementById("lock-position-icon");
const dragHeader = document.querySelector(".app-header");
const checklistInputs = [...document.querySelectorAll(".check-card input")];
const progressValue = document.querySelector(".progress-copy strong");
const progressBar = document.querySelector(".progress-track span");

let requestInProgress = false;
let rankRequestInProgress = false;
let positionLocked = false;
let manualDragging = false;
let dragPointerId = null;
let pendingDragPoint = null;
let dragAnimationFrame = null;

async function startManualDrag(event) {
  if (
    event.button !== 0 ||
    positionLocked ||
    event.target.closest("button, input, label, a")
  ) {
    return;
  }

  event.preventDefault();
  dragPointerId = event.pointerId;

  try {
    dragHeader.setPointerCapture(event.pointerId);
  } catch {
    // O arraste ainda funciona pelos eventos globais se a captura não estiver disponível.
  }

  const started = await window.milioAPI.startWindowDrag(event.screenX, event.screenY);
  manualDragging = Boolean(started);
  document.body.classList.toggle("is-manual-dragging", manualDragging);
}

function moveManualDrag(event) {
  if (!manualDragging || event.pointerId !== dragPointerId) return;

  pendingDragPoint = {
    screenX: event.screenX,
    screenY: event.screenY
  };

  if (dragAnimationFrame !== null) return;

  dragAnimationFrame = requestAnimationFrame(() => {
    dragAnimationFrame = null;
    if (!pendingDragPoint || !manualDragging) return;

    window.milioAPI.moveWindowDuringDrag(
      pendingDragPoint.screenX,
      pendingDragPoint.screenY
    );
    pendingDragPoint = null;
  });
}

function endManualDrag(event) {
  if (
    !manualDragging ||
    (event.pointerId !== undefined && event.pointerId !== dragPointerId)
  ) {
    return;
  }

  manualDragging = false;
  pendingDragPoint = null;
  document.body.classList.remove("is-manual-dragging");
  window.milioAPI.endWindowDrag();

  if (dragAnimationFrame !== null) {
    cancelAnimationFrame(dragAnimationFrame);
    dragAnimationFrame = null;
  }

  try {
    dragHeader.releasePointerCapture(dragPointerId);
  } catch {
    // A captura pode já ter sido liberada pelo Windows.
  }

  dragPointerId = null;
}

function renderPositionLock(locked) {
  positionLocked = locked;
  document.body.classList.toggle("position-locked", locked);
  lockPositionButton.classList.toggle("is-locked", locked);
  lockPositionIcon.textContent = locked ? "🔒" : "🔓";
  lockPositionButton.title = locked
    ? "Desbloquear posição e tamanho"
    : "Bloquear posição e tamanho";
  lockPositionButton.setAttribute(
    "aria-label",
    locked
      ? "Desbloquear posição e tamanho"
      : "Bloquear posição e tamanho"
  );
}

async function initializePositionLock() {
  try {
    const state = await window.milioAPI.getPositionState();
    renderPositionLock(Boolean(state.locked));
  } catch (error) {
    console.error("Não foi possível carregar o bloqueio de posição:", error);
    renderPositionLock(false);
  }
}

function formatGameTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setConnectionStatus(connected) {
  statusPartida.classList.toggle("online", connected);
  statusPartida.classList.toggle("offline", !connected);
  statusPartida.lastChild.textContent = connected
    ? " Dados da partida ao vivo"
    : " Aguardando partida";
}

async function updateLiveData() {
  if (requestInProgress) return;
  requestInProgress = true;

  try {
    const data = await window.milioAPI.getLiveData();

    if (!data.connected) {
      setConnectionStatus(false);
      return;
    }

    tempoPartida.textContent = formatGameTime(data.gameTime);
    ouroAtual.textContent = Math.floor(data.currentGold).toLocaleString("pt-BR");
    nivelAtual.textContent = String(data.level);
    setConnectionStatus(true);
  } catch (error) {
    console.error("Não foi possível atualizar os dados do LoL:", error);
    setConnectionStatus(false);
  } finally {
    requestInProgress = false;
  }
}

function renderRankUnavailable(message) {
  rankCard.dataset.tier = "OFFLINE";
  rankValue.textContent = "ELO indisponível";
  rankQueue.textContent = "CONTA";
  rankAccount.textContent = message || "Abra o League Client e faça login";
  rankPdl.textContent = "— PDL";
}

async function updateRankData() {
  if (rankRequestInProgress) return;
  rankRequestInProgress = true;

  try {
    const data = await window.milioAPI.getRank();

    if (!data.connected) {
      renderRankUnavailable(data.message);
      return;
    }

    rankCard.dataset.tier = data.tier || "UNRANKED";
    rankValue.textContent = data.label || "Sem classificação";
    rankQueue.textContent = String(data.queueLabel || "Solo/Duo").toUpperCase();
    rankAccount.textContent = data.riotId || data.gameName || "Conta logada detectada";
    rankPdl.textContent = data.ranked ? `${data.leaguePoints} PDL` : "SEM ELO";
  } catch (error) {
    console.error("Não foi possível atualizar o ELO:", error);
    renderRankUnavailable("Falha ao consultar o League Client");
  } finally {
    rankRequestInProgress = false;
  }
}

function updateChecklistProgress() {
  const completed = checklistInputs.filter((input) => input.checked).length;
  const total = checklistInputs.length;
  const percentage = total ? (completed / total) * 100 : 0;

  progressValue.textContent = `${completed}/${total}`;
  progressBar.style.width = `${percentage}%`;
}

checklistInputs.forEach((input) => {
  input.addEventListener("change", updateChecklistProgress);
});

minimizeButton.addEventListener("click", () => {
  window.milioAPI.minimizeWindow();
});

lockPositionButton.addEventListener("click", async () => {
  try {
    const state = await window.milioAPI.setPositionLocked(!positionLocked);
    renderPositionLock(Boolean(state.locked));
  } catch (error) {
    console.error("Não foi possível alterar o bloqueio de posição:", error);
  }
});

dragHeader.addEventListener("pointerdown", startManualDrag);
dragHeader.addEventListener("pointermove", moveManualDrag);
dragHeader.addEventListener("pointerup", endManualDrag);
dragHeader.addEventListener("pointercancel", endManualDrag);
window.addEventListener("blur", () => {
  if (manualDragging) endManualDrag({});
});

updateChecklistProgress();
initializePositionLock();
updateLiveData();
updateRankData();
setInterval(updateLiveData, 1000);
setInterval(updateRankData, 30000);

"use strict";

(() => {
  const LIVE_DATA_URL = "https://127.0.0.1:2999/liveclientdata/allgamedata";
  const GOLD_GOAL = 2200;
  const POLL_INTERVAL_MS = 1000;
  const numberFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0
  });

  const timelineEvents = [...document.querySelectorAll("li.timeline-event")];
  const matchStatus = document.getElementById("match-status");
  const matchStatusText = document.getElementById("match-status-text");
  const currentGoldText = document.getElementById("current-gold");
  const goldProgressTrack = document.getElementById("gold-progress-track");
  const goldProgressBar = document.getElementById("gold-progress-bar");
  const goldProgressLabel = document.getElementById("gold-progress-label");
  const goldRemainingLabel = document.getElementById("gold-remaining-label");
  const statusKda = document.getElementById("status-kda");
  const statusCs = document.getElementById("status-cs");
  const statusVision = document.getElementById("status-vision");
  const statusLevel = document.getElementById("status-level");
  const minimizeButton = document.getElementById("dashboard-minimize");
  const toggleSizeButton = document.getElementById("dashboard-toggle-size");

  let pollingInProgress = false;
  let pollingTimer;

  function parseTimelineTime(value) {
    const [minutes, seconds] = String(value || "0:0")
      .split(":")
      .map(Number);

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
    return minutes * 60 + seconds;
  }

  function updateTimeline(gameTime) {
    const elapsedSeconds = Math.max(0, Number(gameTime) || 0);
    let mostRecentEvent = null;
    let mostRecentTime = -1;

    timelineEvents.forEach((eventElement) => {
      eventElement.classList.remove("active");

      const eventTime = parseTimelineTime(eventElement.dataset.time);
      if (eventTime <= elapsedSeconds && eventTime >= mostRecentTime) {
        mostRecentEvent = eventElement;
        mostRecentTime = eventTime;
      }
    });

    mostRecentEvent?.classList.add("active");
  }

  function updateGoldGoal(currentGold) {
    const gold = Math.max(0, Number(currentGold) || 0);
    const rawPercentage = (gold / GOLD_GOAL) * 100;
    const visiblePercentage = Math.min(100, Math.max(0, rawPercentage));
    const roundedPercentage = Math.round(rawPercentage);
    const remainingGold = Math.max(0, GOLD_GOAL - gold);

    currentGoldText.textContent = numberFormatter.format(gold);
    goldProgressBar.style.setProperty("--progress", `${visiblePercentage}%`);
    goldProgressTrack.setAttribute("aria-valuenow", String(Math.round(visiblePercentage)));
    goldProgressLabel.textContent = `${roundedPercentage}% da meta`;
    goldRemainingLabel.textContent = remainingGold > 0
      ? `faltam ${numberFormatter.format(remainingGold)}`
      : "meta alcançada";
  }

  function normalizeIdentity(value) {
    return String(value || "").trim().toLocaleLowerCase("pt-BR");
  }

  function findActivePlayer(allGameData) {
    const activePlayer = allGameData?.activePlayer;
    const allPlayers = Array.isArray(allGameData?.allPlayers)
      ? allGameData.allPlayers
      : [];

    if (!activePlayer) return null;

    const activeIdentities = new Set(
      [
        activePlayer.riotId,
        activePlayer.summonerName,
        activePlayer.riotIdGameName
      ]
        .map(normalizeIdentity)
        .filter(Boolean)
    );

    return allPlayers.find((player) => {
      return [player.riotId, player.summonerName, player.riotIdGameName]
        .map(normalizeIdentity)
        .some((identity) => identity && activeIdentities.has(identity));
    }) || null;
  }

  function updateQuickStats(allGameData) {
    const activePlayer = allGameData?.activePlayer;
    const player = findActivePlayer(allGameData);
    const scores = player?.scores || {};

    const kills = Number(scores.kills) || 0;
    const deaths = Number(scores.deaths) || 0;
    const assists = Number(scores.assists) || 0;
    const creepScore = Number(scores.creepScore) || 0;
    const wardScore = Number(scores.wardScore) || 0;
    const level = Number(activePlayer?.level ?? player?.level) || 1;

    statusKda.textContent = `${kills} / ${deaths} / ${assists}`;
    statusCs.textContent = numberFormatter.format(creepScore);
    statusVision.textContent = numberFormatter.format(wardScore);
    statusLevel.textContent = numberFormatter.format(level);
  }

  function setConnectionStatus(connected) {
    matchStatus.classList.toggle("online", connected);
    matchStatus.classList.toggle("offline", !connected);
    matchStatusText.textContent = connected
      ? "Partida em andamento"
      : "Aguardando partida";
  }

  function resetDashboard() {
    setConnectionStatus(false);
    timelineEvents.forEach((eventElement) => eventElement.classList.remove("active"));
    updateGoldGoal(0);
    statusKda.textContent = "— / — / —";
    statusCs.textContent = "—";
    statusVision.textContent = "—";
    statusLevel.textContent = "—";
  }

  async function requestAllGameData() {
    // Caminho recomendado no Electron: preload -> IPC -> processo principal.
    if (window.dashboardAPI?.getLiveData) {
      const result = await window.dashboardAPI.getLiveData();
      if (!result?.connected || !result.data) {
        throw new Error(result?.message || "Partida indisponível");
      }
      return result.data;
    }

    // Fallback útil ao testar o HTML fora do fluxo principal do Electron.
    const response = await fetch(LIVE_DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Live Client Data respondeu com ${response.status}`);
    }
    return response.json();
  }

  async function updateDashboard() {
    if (pollingInProgress) return;
    pollingInProgress = true;

    try {
      const allGameData = await requestAllGameData();
      const gameTime = Number(allGameData?.gameData?.gameTime) || 0;
      const currentGold = Number(allGameData?.activePlayer?.currentGold) || 0;

      setConnectionStatus(true);
      updateTimeline(gameTime);
      updateGoldGoal(currentGold);
      updateQuickStats(allGameData);
    } catch {
      resetDashboard();
    } finally {
      pollingInProgress = false;
    }
  }

  minimizeButton?.addEventListener("click", () => {
    window.dashboardAPI?.minimize();
  });

  toggleSizeButton?.addEventListener("click", async () => {
    const result = await window.dashboardAPI?.toggleSize();
    if (result && typeof result.maximized === "boolean") {
      toggleSizeButton.textContent = result.maximized ? "▣" : "□";
      toggleSizeButton.title = result.maximized ? "Diminuir" : "Maximizar";
    }
  });

  resetDashboard();
  updateDashboard();
  pollingTimer = setInterval(updateDashboard, POLL_INTERVAL_MS);

  window.addEventListener("beforeunload", () => {
    clearInterval(pollingTimer);
  });
})();

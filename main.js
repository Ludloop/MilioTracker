const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const { fetchActivePlayerSide, requestLiveClient } = require("./src/live-client");
const {
  getLoggedInLeagueAccount,
  getLoggedInLeagueRank
} = require("./src/league-client");
const { readMinimapScale } = require("./src/lol-settings");
const {
  DEFAULT_MINIMAP_CALIBRATION,
  calculateMinimapBounds,
  sanitizeCalibration
} = require("./src/minimap-layout");

let mainWindow;
let wardOverlayWindow;
let wardOverlayReady = false;
let wardPollingTimer;
let wardPollingInProgress = false;
let lastWardState = {
  connected: false,
  side: null,
  team: null,
  minimapScale: 1,
  bounds: null
};
let windowState = { locked: false };
let activeManualDrag = null;
let dashboardWindow = null;
let dashboardShouldBeVisible = false;
let dashboardMatchActive = false;
let dashboardManuallyMinimized = false;

const APP_ID = "com.lud.miliotracker";
const WARD_POLL_INTERVAL_MS = 5000;

function getSettingsDirectory() {
  const settingsDirectory = path.join(app.getPath("userData"), "milio-tracker-data");
  fs.mkdirSync(settingsDirectory, { recursive: true });
  return settingsDirectory;
}

function getWindowStatePath() {
  return path.join(getSettingsDirectory(), "window-state.json");
}

function getWardCalibrationPath() {
  return path.join(getSettingsDirectory(), "ward-overlay-settings.json");
}

function loadWindowState() {
  try {
    const savedState = JSON.parse(fs.readFileSync(getWindowStatePath(), "utf8"));
    return {
      x: Number.isInteger(savedState.x) ? savedState.x : undefined,
      y: Number.isInteger(savedState.y) ? savedState.y : undefined,
      width: Number.isInteger(savedState.width) ? savedState.width : undefined,
      height: Number.isInteger(savedState.height) ? savedState.height : undefined,
      locked: Boolean(savedState.locked)
    };
  } catch {
    return { locked: false };
  }
}

function loadWardCalibration() {
  const calibrationPath = getWardCalibrationPath();

  try {
    if (!fs.existsSync(calibrationPath)) {
      fs.writeFileSync(
        calibrationPath,
        JSON.stringify(DEFAULT_MINIMAP_CALIBRATION, null, 2),
        "utf8"
      );
      return { ...DEFAULT_MINIMAP_CALIBRATION };
    }

    const savedCalibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));
    return sanitizeCalibration(savedCalibration);
  } catch (error) {
    console.warn("Não foi possível ler a calibração do minimapa:", error.message);
    return { ...DEFAULT_MINIMAP_CALIBRATION };
  }
}

function isPositionVisible(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;

  return screen.getAllDisplays().some(({ workArea }) => {
    const insideHorizontally = x >= workArea.x - 300 && x < workArea.x + workArea.width - 50;
    const insideVertically = y >= workArea.y - 700 && y < workArea.y + workArea.height - 50;
    return insideHorizontally && insideVertically;
  });
}

function saveWindowState(window, locked = windowState.locked) {
  if (!window || window.isDestroyed()) return;

  const { x, y, width, height } = window.getBounds();
  windowState = { x, y, width, height, locked: Boolean(locked) };

  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(windowState, null, 2), "utf8");
  } catch (error) {
    console.error("Não foi possível salvar a posição do overlay:", error);
  }
}

function createWindow() {
  windowState = loadWindowState();
  const workArea = screen.getPrimaryDisplay().workArea;
  const initialWidth = Math.min(650, Math.max(280, windowState.width || 350));
  const initialHeight = Math.min(950, Math.max(450, windowState.height || 800));
  const savedPositionIsVisible = isPositionVisible(windowState.x, windowState.y);
  const initialX = savedPositionIsVisible
    ? windowState.x
    : workArea.x + workArea.width - initialWidth - 20;
  const initialY = savedPositionIsVisible
    ? windowState.y
    : workArea.y + 20;
  const developmentIconPath = path.join(__dirname, "build", "icon.png");

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: initialX,
    y: initialY,
    minWidth: 280,
    maxWidth: 650,
    minHeight: 450,
    maxHeight: 950,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    icon: fs.existsSync(developmentIconPath) ? developmentIconPath : undefined,
    resizable: !windowState.locked,
    movable: !windowState.locked,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile("index.html");
  mainWindow.setAlwaysOnTop(true, "screen-saver");

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("moved", () => {
    if (!activeManualDrag) saveWindowState(mainWindow);
  });

  mainWindow.on("resized", () => {
    saveWindowState(mainWindow);
  });

  mainWindow.on("close", () => {
    saveWindowState(mainWindow);
  });

  mainWindow.on("closed", () => {
    activeManualDrag = null;
    mainWindow = null;
    stopWardOverlayPolling();

    if (wardOverlayWindow && !wardOverlayWindow.isDestroyed()) {
      wardOverlayWindow.destroy();
    }
  });
}

function createWardOverlayWindow() {
  const { bounds } = screen.getPrimaryDisplay();

  wardOverlayWindow = new BrowserWindow({
    width: 1,
    height: 1,
    x: bounds.x + bounds.width - 1,
    y: bounds.y + bounds.height - 1,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "ward-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  wardOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  wardOverlayWindow.setIgnoreMouseEvents(true);
  wardOverlayWindow.loadFile("ward-overlay.html");

  wardOverlayWindow.webContents.once("did-finish-load", () => {
    wardOverlayReady = true;
    sendWardOverlayState(lastWardState);
  });

  wardOverlayWindow.on("closed", () => {
    wardOverlayReady = false;
    wardOverlayWindow = null;
  });
}

function getDashboardDisplay() {
  const primaryDisplay = screen.getPrimaryDisplay();

  return (
    screen
      .getAllDisplays()
      .find((display) => display.id !== primaryDisplay.id) ||
    primaryDisplay
  );
}

function getNormalDashboardBounds(display) {
  const { x, y, width, height } = display.workArea;

  const dashboardWidth = Math.min(
    1320,
    Math.max(760, Math.round(width * 0.78)),
    width
  );

  const dashboardHeight = Math.min(
    840,
    Math.max(600, Math.round(height * 0.82)),
    height
  );

  return {
    x: x + Math.round((width - dashboardWidth) / 2),
    y: y + Math.round((height - dashboardHeight) / 2),
    width: dashboardWidth,
    height: dashboardHeight
  };
}

function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    return dashboardWindow;
  }

  const display = getDashboardDisplay();

  dashboardWindow = new BrowserWindow({
    ...getNormalDashboardBounds(display),
    show: false,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    minWidth: 760,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#090d14",
    webPreferences: {
      preload: path.join(__dirname, "dashboard-preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  dashboardWindow.loadFile(
    path.join(__dirname, "dashboard.html")
  );

  dashboardWindow.once("ready-to-show", () => {
    if (
      dashboardShouldBeVisible &&
      !dashboardManuallyMinimized &&
      dashboardWindow &&
      !dashboardWindow.isDestroyed()
    ) {
      dashboardWindow.show();
    }
  });

  dashboardWindow.on("closed", () => {
    dashboardWindow = null;
  });

  return dashboardWindow;
}

function showDashboard() {
  const newMatch = !dashboardMatchActive;

  dashboardMatchActive = true;
  dashboardShouldBeVisible = true;

  const window = createDashboardWindow();

  if (newMatch) {
    dashboardManuallyMinimized = false;

    if (window.isMinimized()) {
      window.restore();
    }

    const display = getDashboardDisplay();
    window.setBounds(getNormalDashboardBounds(display));
    window.maximize();
  }

  if (dashboardManuallyMinimized) return;

  if (!window.webContents.isLoading() && !window.isVisible()) {
    window.show();
  }
}

function hideDashboard() {
  dashboardMatchActive = false;
  dashboardShouldBeVisible = false;
  dashboardManuallyMinimized = false;

  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;

  if (dashboardWindow.isMinimized()) {
    dashboardWindow.restore();
  }

  dashboardWindow.hide();
}

function boundsAreEqual(a, b) {
  return Boolean(
    a &&
      b &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height
  );
}

function sendWardOverlayState(state) {
  if (!wardOverlayReady || !wardOverlayWindow || wardOverlayWindow.isDestroyed()) return;
  wardOverlayWindow.webContents.send("ward-overlay:update", state);
}

function hideWardOverlay(message) {
  lastWardState = {
    ...lastWardState,
    connected: false,
    side: null,
    team: null,
    message
  };

  sendWardOverlayState(lastWardState);

  if (wardOverlayWindow && !wardOverlayWindow.isDestroyed()) {
    wardOverlayWindow.hide();
  }

  hideDashboard();
}

async function updateWardOverlay() {
  if (wardPollingInProgress || !wardOverlayWindow || wardOverlayWindow.isDestroyed()) return;
  wardPollingInProgress = true;

  try {
    const [playerSide, minimapSetting] = await Promise.all([
      fetchActivePlayerSide(),
      readMinimapScale()
    ]);

    if (!playerSide) {
      hideWardOverlay("Não foi possível identificar o jogador local na partida.");
      return;
    }

    const calibration = loadWardCalibration();
    const display = screen.getPrimaryDisplay();
    const nextBounds = calculateMinimapBounds(
      display,
      minimapSetting.value,
      calibration
    );

    if (!boundsAreEqual(wardOverlayWindow.getBounds(), nextBounds)) {
      wardOverlayWindow.setBounds(nextBounds, false);
    }

    lastWardState = {
      connected: true,
      side: playerSide.side,
      team: playerSide.team,
      playerName: playerSide.playerName,
      minimapScale: minimapSetting.value,
      minimapScaleSource: minimapSetting.sourcePath,
      bounds: nextBounds
    };

    sendWardOverlayState(lastWardState);

    if (!wardOverlayWindow.isVisible()) {
      wardOverlayWindow.showInactive();
      wardOverlayWindow.setIgnoreMouseEvents(true);
    }
    
    showDashboard();

  } catch (error) {
    hideWardOverlay(error.message);
  } finally {
    wardPollingInProgress = false;
  }
  
}

function startWardOverlayPolling() {
  stopWardOverlayPolling();
  updateWardOverlay();
  wardPollingTimer = setInterval(updateWardOverlay, WARD_POLL_INTERVAL_MS);
}

function stopWardOverlayPolling() {
  if (wardPollingTimer) {
    clearInterval(wardPollingTimer);
    wardPollingTimer = undefined;
  }
}

ipcMain.handle("lol:get-live-data", async () => {
  try {
    const [activePlayer, gameStats] = await Promise.all([
      requestLiveClient("activeplayer"),
      requestLiveClient("gamestats")
    ]);

    return {
      connected: true,
      gameTime: Number(gameStats.gameTime) || 0,
      currentGold: Number(activePlayer.currentGold) || 0,
      level: Number(activePlayer.level) || 1
    };
  } catch (error) {
    return {
      connected: false,
      message: error.message
    };
  }
});

ipcMain.handle("lol:get-logged-account", async () => {
  try {
    const account = await getLoggedInLeagueAccount();
    return { connected: true, ...account };
  } catch (error) {
    return { connected: false, message: error.message };
  }
});

ipcMain.handle("lol:get-rank", async () => {
  try {
    const [account, rank] = await Promise.all([
      getLoggedInLeagueAccount(),
      getLoggedInLeagueRank()
    ]);

    return {
      connected: true,
      riotId: account.riotId,
      gameName: account.gameName,
      tagLine: account.tagLine,
      ...rank
    };
  } catch (error) {
    return { connected: false, message: error.message };
  }
});

ipcMain.handle("ward-overlay:get-state", () => lastWardState);

ipcMain.on("window:minimize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.minimize();
});

ipcMain.handle("window:get-position-state", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return { locked: false };

  return { locked: Boolean(windowState.locked) };
});

ipcMain.handle("window:start-manual-drag", (event, point) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const screenX = Number(point?.screenX);
  const screenY = Number(point?.screenY);

  if (
    !window ||
    windowState.locked ||
    !Number.isFinite(screenX) ||
    !Number.isFinite(screenY)
  ) {
    return false;
  }

  const { x, y } = window.getBounds();
  activeManualDrag = {
    senderId: event.sender.id,
    offsetX: screenX - x,
    offsetY: screenY - y
  };

  return true;
});

ipcMain.on("window:manual-drag-move", (event, point) => {
  if (
    !activeManualDrag ||
    activeManualDrag.senderId !== event.sender.id ||
    windowState.locked
  ) {
    return;
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  const screenX = Number(point?.screenX);
  const screenY = Number(point?.screenY);

  if (!window || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return;

  window.setPosition(
    Math.round(screenX - activeManualDrag.offsetX),
    Math.round(screenY - activeManualDrag.offsetY),
    false
  );
});

ipcMain.on("window:end-manual-drag", (event) => {
  if (!activeManualDrag || activeManualDrag.senderId !== event.sender.id) return;

  const window = BrowserWindow.fromWebContents(event.sender);
  activeManualDrag = null;
  saveWindowState(window);
});

ipcMain.handle("window:set-position-locked", (event, locked) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return { locked: false };

  const shouldLock = Boolean(locked);
  activeManualDrag = null;

  if (shouldLock) {
    saveWindowState(window, true);
    window.setMovable(false);
    window.setResizable(false);
  } else {
    window.setMovable(true);
    window.setResizable(true);
    saveWindowState(window, false);
  }

  return { locked: shouldLock };
});

ipcMain.handle("dashboard:get-live-data", async () => {
  try {
    const data = await requestLiveClient("allgamedata");

    return {
      connected: true,
      data
    };
  } catch (error) {
    return {
      connected: false,
      data: null,
      message: error.message
    };
  }
});

ipcMain.on("dashboard:minimize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window !== dashboardWindow) return;

  dashboardManuallyMinimized = true;
  window.minimize();
});

ipcMain.handle("dashboard:toggle-size", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window !== dashboardWindow) {
    return { maximized: false };
  }

  dashboardManuallyMinimized = false;

  if (window.isMaximized()) {
    window.unmaximize();

    const display = getDashboardDisplay();
    window.setBounds(getNormalDashboardBounds(display));

    return { maximized: false };
  }

  window.maximize();
  return { maximized: true };
});

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  createWindow();
  createWardOverlayWindow();
  createDashboardWindow();
  startWardOverlayPolling();

  screen.on("display-metrics-changed", () => {
    updateWardOverlay();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createWardOverlayWindow();
      createDashboardWindow();
      startWardOverlayPolling();
    }
  });
});

app.on("before-quit", () => {
  stopWardOverlayPolling();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

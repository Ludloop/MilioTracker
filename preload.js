const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("milioAPI", {
  getLiveData: () => ipcRenderer.invoke("lol:get-live-data"),
  getLoggedAccount: () => ipcRenderer.invoke("lol:get-logged-account"),
  getRank: () => ipcRenderer.invoke("lol:get-rank"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  getPositionState: () => ipcRenderer.invoke("window:get-position-state"),
  setPositionLocked: (locked) => ipcRenderer.invoke("window:set-position-locked", locked),
  startWindowDrag: (screenX, screenY) =>
    ipcRenderer.invoke("window:start-manual-drag", { screenX, screenY }),
  moveWindowDuringDrag: (screenX, screenY) =>
    ipcRenderer.send("window:manual-drag-move", { screenX, screenY }),
  endWindowDrag: () => ipcRenderer.send("window:end-manual-drag")
});

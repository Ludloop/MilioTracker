const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wardOverlayAPI", {
  getState: () => ipcRenderer.invoke("ward-overlay:get-state"),
  onStateChanged: (callback) => {
    if (typeof callback !== "function") return () => {};

    const listener = (_event, state) => callback(state);
    ipcRenderer.on("ward-overlay:update", listener);
    return () => ipcRenderer.removeListener("ward-overlay:update", listener);
  }
});

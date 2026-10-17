"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dashboardAPI", {
  getLiveData: () => ipcRenderer.invoke("dashboard:get-live-data"),
  minimize: () => ipcRenderer.send("dashboard:minimize"),
  toggleSize: () => ipcRenderer.invoke("dashboard:toggle-size")
});

// preload.js

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  authenticate: () => ipcRenderer.invoke("auth:google"),
  syncReceipts: () => ipcRenderer.invoke("receipts:sync"),
  getReceipts: () => ipcRenderer.invoke("receipts:get"),
  getUser: () => ipcRenderer.invoke("user:get"),
});

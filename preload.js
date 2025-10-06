// preload.js - Enhanced version

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  authenticate: () => ipcRenderer.invoke("auth:google"),
  clearAuth: () => ipcRenderer.invoke("auth:clear"),
  debugAuth: () => ipcRenderer.invoke("auth:debug"),
  syncReceipts: () => ipcRenderer.invoke("receipts:sync"),
  getReceipts: () => ipcRenderer.invoke("receipts:get"),
  updateReceipt: (messageId, updates) =>
    ipcRenderer.invoke("receipts:update", messageId, updates),
  bulkUpdateReceipts: (messageIds, updates) =>
    ipcRenderer.invoke("receipts:bulkUpdate", messageIds, updates),
  getUser: () => ipcRenderer.invoke("user:get"),
  getCategories: () => ipcRenderer.invoke("categories:get"),
  addCategory: (category) => ipcRenderer.invoke("categories:add", category),

  // Progress listeners
  onSyncProgress: (callback) =>
    ipcRenderer.on("sync-progress", (event, data) => callback(data)),
  onSyncComplete: (callback) =>
    ipcRenderer.on("sync-complete", () => callback()),
});

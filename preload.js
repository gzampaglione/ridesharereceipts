// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  authenticate: () => ipcRenderer.invoke("auth:google"),
  clearAuth: () => ipcRenderer.invoke("auth:clear"),
  syncReceipts: () => ipcRenderer.invoke("receipts:sync"),
  getReceipts: () => ipcRenderer.invoke("receipts:get"),
  updateReceipt: (messageId, updates) =>
    ipcRenderer.invoke("receipts:update", messageId, updates),
  bulkUpdateReceipts: (messageIds, updates) =>
    ipcRenderer.invoke("receipts:bulkUpdate", messageIds, updates),
  getUser: () => ipcRenderer.invoke("user:get"),
  getCategories: () => ipcRenderer.invoke("categories:get"),
  addCategory: (category) => ipcRenderer.invoke("categories:add", category),

  // Listeners for sync progress
  onSyncProgress: (callback) =>
    ipcRenderer.on("sync-progress", (event, data) => callback(data)),
  onSyncComplete: (callback) =>
    ipcRenderer.on("sync-complete", () => callback()),

  // Function to clean up listeners
  removeSyncListeners: () => {
    ipcRenderer.removeAllListeners("sync-progress");
    ipcRenderer.removeAllListeners("sync-complete");
  },
});

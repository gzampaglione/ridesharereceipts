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

  // Settings
  getParserPreference: () => ipcRenderer.invoke("settings:getParserPreference"),
  setParserPreference: (preference) =>
    ipcRenderer.invoke("settings:setParserPreference", preference),
  getGeminiKey: () => ipcRenderer.invoke("settings:getGeminiKey"),
  setGeminiKey: (key) => ipcRenderer.invoke("settings:setGeminiKey", key),
  getTestModeLimit: () => ipcRenderer.invoke("settings:getTestModeLimit"),
  setTestModeLimit: (limit) =>
    ipcRenderer.invoke("settings:setTestModeLimit", limit),

  // Listeners for sync progress
  onSyncProgress: (callback) =>
    ipcRenderer.on("sync-progress", (event, data) => callback(data)),
  onSyncComplete: (callback) =>
    ipcRenderer.on("sync-complete", (event, data) => callback(data)),

  // Function to clean up listeners
  removeSyncListeners: () => {
    ipcRenderer.removeAllListeners("sync-progress");
    ipcRenderer.removeAllListeners("sync-complete");
  },
});

// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  authenticate: () => ipcRenderer.invoke("auth:google"),
  clearAuth: () => ipcRenderer.invoke("auth:clear"),
  syncReceipts: () => ipcRenderer.invoke("receipts:sync"),
  getReceipts: () => ipcRenderer.invoke("receipts:get"),
  clearReceipts: () => ipcRenderer.invoke("receipts:clear"),
  updateReceipt: (messageId, updates) =>
    ipcRenderer.invoke("receipts:update", messageId, updates),
  bulkUpdateReceipts: (messageIds, updates) =>
    ipcRenderer.invoke("receipts:bulkUpdate", messageIds, updates),
  openEmail: (messageId) => ipcRenderer.invoke("receipts:openEmail", messageId),
  getEmailHtml: (messageId) =>
    ipcRenderer.invoke("receipts:getEmailHtml", messageId),
  getUser: () => ipcRenderer.invoke("user:get"),
  getCategories: () => ipcRenderer.invoke("categories:get"),
  addCategory: (category) => ipcRenderer.invoke("categories:add", category),

  // Settings
  getParserPreference: () => ipcRenderer.invoke("settings:getParserPreference"),
  setParserPreference: (preference) =>
    ipcRenderer.invoke("settings:setParserPreference", preference),
  getGeminiKey: () => ipcRenderer.invoke("settings:getGeminiKey"),
  setGeminiKey: (key) => ipcRenderer.invoke("settings:setGeminiKey", key),

  getGeminiModel: () => ipcRenderer.invoke("settings:getGeminiModel"),
  setGeminiModel: (model) =>
    ipcRenderer.invoke("settings:setGeminiModel", model),

  getTestModeLimit: () => ipcRenderer.invoke("settings:getTestModeLimit"),
  setTestModeLimit: (limit) =>
    ipcRenderer.invoke("settings:setTestModeLimit", limit),

  // Model selection
  getGeminiModel: () => ipcRenderer.invoke("settings:getGeminiModel"),
  setGeminiModel: (model) =>
    ipcRenderer.invoke("settings:setGeminiModel", model),

  // Subject regex patterns
  getUberSubjectRegex: () => ipcRenderer.invoke("settings:getUberSubjectRegex"),
  setUberSubjectRegex: (regex) =>
    ipcRenderer.invoke("settings:setUberSubjectRegex", regex),
  getLyftSubjectRegex: () => ipcRenderer.invoke("settings:getLyftSubjectRegex"),
  setLyftSubjectRegex: (regex) =>
    ipcRenderer.invoke("settings:setLyftSubjectRegex", regex),
  getCurbSubjectRegex: () => ipcRenderer.invoke("settings:getCurbSubjectRegex"),
  setCurbSubjectRegex: (regex) =>
    ipcRenderer.invoke("settings:setCurbSubjectRegex", regex),

  // Address display mode - ADD THESE TWO LINES
  getAddressDisplayMode: () =>
    ipcRenderer.invoke("settings:getAddressDisplayMode"),
  setAddressDisplayMode: (mode) =>
    ipcRenderer.invoke("settings:setAddressDisplayMode", mode),

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

  // Sync on startup
  getSyncOnStartup: () => ipcRenderer.invoke("settings:getSyncOnStartup"),
  setSyncOnStartup: (value) =>
    ipcRenderer.invoke("settings:setSyncOnStartup", value),

  // Send email via Gmail
  sendEmail: (to, subject, body, isHtml) =>
    ipcRenderer.invoke("email:send", to, subject, body, isHtml),

  // Database backup/restore
  backupDatabase: () => ipcRenderer.invoke("database:backup"),
  restoreDatabase: () => ipcRenderer.invoke("database:restore"),
});

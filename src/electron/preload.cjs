const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getInventory: () => ipcRenderer.invoke("get-inventory"),
  startInventoryScan: () => ipcRenderer.invoke("start-inventory-scan"),
  clearInventoryCache: () => ipcRenderer.invoke("clear-inventory-cache"),
  onInventoryEntry: (cb) => ipcRenderer.on("inventory-entry", (_e, data) => cb(data)),
  onInventoryEnriched: (cb) => ipcRenderer.on("inventory-enriched", (_e, data) => cb(data)),
  onInventoryComplete: (cb) => ipcRenderer.on("inventory-complete", (_e, payload) => cb(payload)),
  offInventoryListeners: () => {
    ipcRenderer.removeAllListeners("inventory-entry");
    ipcRenderer.removeAllListeners("inventory-enriched");
    ipcRenderer.removeAllListeners("inventory-complete");
  },
  runDoctor: () => ipcRenderer.invoke("run-doctor"),
  runDoctorTool: (tool) => ipcRenderer.invoke("doctor-tool", tool),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  getSelfInfo: () => ipcRenderer.invoke("get-self-info"),
  getToolsList: () => ipcRenderer.invoke("get-tools-list"),
  checkToolLatest: (tool) => ipcRenderer.invoke("refresh-tool-update-info", tool),
  refreshToolUpdateInfo: (tool) => ipcRenderer.invoke("refresh-tool-update-info", tool),
  startUpdateScan: () => ipcRenderer.invoke("start-update-scan"),
  onToolDetected: (cb) => ipcRenderer.on("tool-detected", (_e, data) => cb(data)),
  onToolLatest: (cb) => ipcRenderer.on("tool-latest", (_e, data) => cb(data)),
  onScanComplete: (cb) => ipcRenderer.on("scan-complete", () => cb()),
  offScanListeners: () => {
    ipcRenderer.removeAllListeners("tool-detected");
    ipcRenderer.removeAllListeners("tool-latest");
    ipcRenderer.removeAllListeners("scan-complete");
  },
  runUpdate: (tool) => ipcRenderer.invoke("run-update", tool),
  getAppUpdateChannel: () => ipcRenderer.invoke("get-app-update-channel"),
  checkAppUpdate: () => ipcRenderer.invoke("check-app-update"),
  getAppUpdateState: () => ipcRenderer.invoke("get-app-update-state"),
  confirmAppUpdateDownload: () => ipcRenderer.invoke("confirm-app-update-download"),
  quitAndInstallAppUpdate: () => ipcRenderer.invoke("quit-and-install-app-update"),
  onAppUpdateAvailable: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("app-update-available", handler);
    return () => ipcRenderer.off("app-update-available", handler);
  },
  onAppUpdateNotAvailable: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("app-update-not-available", handler);
    return () => ipcRenderer.off("app-update-not-available", handler);
  },
  onAppUpdateProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("app-update-progress", handler);
    return () => ipcRenderer.off("app-update-progress", handler);
  },
  onAppUpdateDownloaded: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("app-update-downloaded", handler);
    return () => ipcRenderer.off("app-update-downloaded", handler);
  },
  onAppUpdateError: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("app-update-error", handler);
    return () => ipcRenderer.off("app-update-error", handler);
  },
  getMcpRaw: () => ipcRenderer.invoke("get-mcp-raw"),
  syncMcp: (opts) => ipcRenderer.invoke("sync-mcp", opts),
  openPath: (filePath) => ipcRenderer.invoke("open-path", filePath),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  launchInTerminal: (tool, terminal, cwd) => ipcRenderer.invoke("launch-in-terminal", tool, terminal, cwd),
  ptySpawn:  (tool, cwd)                    => ipcRenderer.invoke("pty-spawn", tool, cwd),
  ptyAttach: (sessionId)                    => ipcRenderer.invoke("pty-attach", sessionId),
  ptyGetOutputBuffer: (sessionId)           => ipcRenderer.invoke("pty-get-output-buffer", sessionId),
  ptySearchOutput: (sessionId, query, opts)  => ipcRenderer.invoke("pty-search-output", sessionId, query, opts),
  ptyGetLogPath: (sessionId)                => ipcRenderer.invoke("pty-get-log-path", sessionId),
  pickFolder: (defaultPath)                 => ipcRenderer.invoke("pick-folder", defaultPath),
  clipboardReadText: ()                     => ipcRenderer.invoke("clipboard-read-text"),
  clipboardWriteText: (text)                => ipcRenderer.invoke("clipboard-write-text", text),
  ptyWrite:  (sessionId, data)          => ipcRenderer.send("pty-write",  sessionId, data),
  ptyResize: (sessionId, cols, rows)    => ipcRenderer.send("pty-resize", sessionId, cols, rows),
  ptyKill:   (sessionId)                => ipcRenderer.send("pty-kill",   sessionId),
  onPtyData: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on("pty-data", handler);
    return () => ipcRenderer.off("pty-data", handler);
  },
  onPtyExit: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on("pty-exit", handler);
    return () => ipcRenderer.off("pty-exit", handler);
  },
  setDefaultModel: (tool, model) => ipcRenderer.invoke("set-default-model", tool, model),
  getEnvVars: () => ipcRenderer.invoke("get-env-vars"),
  wsGetTree: () => ipcRenderer.invoke("ws-get-tree"),
  wsWorkspaceCreate: (name, rootPath) => ipcRenderer.invoke("ws-workspace-create", name, rootPath),
  wsGroupCreate: (workspace, group) => ipcRenderer.invoke("ws-group-create", workspace, group),
  wsSessionCreate: (workspace, group, name, opts) =>
    ipcRenderer.invoke("ws-session-create", workspace, group, name, opts),
  wsSessionStop: (workspace, group, name) =>
    ipcRenderer.invoke("ws-session-stop", workspace, group, name),
  wsGroupLayoutGet: (workspaceId, groupId) =>
    ipcRenderer.invoke("ws-group-layout-get", workspaceId, groupId),
  wsGroupLayoutSave: (workspaceId, groupId, snapshot) =>
    ipcRenderer.invoke("ws-group-layout-save", workspaceId, groupId, snapshot),
  wsGroupLayoutSetActive: (workspaceId, groupId) =>
    ipcRenderer.invoke("ws-group-layout-set-active", workspaceId, groupId),
  profileGetTree: () => ipcRenderer.invoke("profile-get-tree"),
  profileCreate: (name, defaultCwd, defaultTool, accentColor) =>
    ipcRenderer.invoke("profile-create", name, defaultCwd, defaultTool, accentColor),
  profileUpdate: (profileId, patch) => ipcRenderer.invoke("profile-update", profileId, patch),
  profileDelete: (profileId) => ipcRenderer.invoke("profile-delete", profileId),
  profileReorder: (orderedProfileIds) =>
    ipcRenderer.invoke("profile-reorder", orderedProfileIds),
  exportBackup: (localStorage) => ipcRenderer.invoke("export-backup", localStorage),
  importBackup: () => ipcRenderer.invoke("import-backup"),
  relaunchApp: () => ipcRenderer.invoke("relaunch-app"),
  openChatWindow: () => ipcRenderer.invoke("open-chat-window"),
  openSettingsWindow: () => ipcRenderer.invoke("open-settings-window"),
  toggleDevTools: () => ipcRenderer.invoke("toggle-devtools"),
});

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
  checkToolLatest: (tool) => ipcRenderer.invoke("check-tool-latest", tool),
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
  getMcpRaw: () => ipcRenderer.invoke("get-mcp-raw"),
  syncMcp: (opts) => ipcRenderer.invoke("sync-mcp", opts),
  openPath: (filePath) => ipcRenderer.invoke("open-path", filePath),
  launchInTerminal: (tool, terminal, cwd) => ipcRenderer.invoke("launch-in-terminal", tool, terminal, cwd),
  ptySpawn:  (tool, cwd)                    => ipcRenderer.invoke("pty-spawn", tool, cwd),
  pickFolder: (defaultPath)                 => ipcRenderer.invoke("pick-folder", defaultPath),
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
  openChatWindow: () => ipcRenderer.invoke("open-chat-window"),
  openSettingsWindow: () => ipcRenderer.invoke("open-settings-window"),
});

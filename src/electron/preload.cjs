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
  previewMcpSync: (opts) => ipcRenderer.invoke("preview-mcp-sync", opts),
  getHealthMonitorState: () => ipcRenderer.invoke("get-health-monitor-state"),
  runHealthCheck: () => ipcRenderer.invoke("run-health-check"),
  setHealthMonitorPrefs: (partial) => ipcRenderer.invoke("set-health-monitor-prefs", partial),
  onHealthMonitorState: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("health-monitor-state", handler);
    return () => ipcRenderer.off("health-monitor-state", handler);
  },
  getSkillsRaw: () => ipcRenderer.invoke("get-skills-raw"),
  syncSkills: (opts) => ipcRenderer.invoke("sync-skills", opts),
  readConfigFile: (filePath) => ipcRenderer.invoke("read-config-file", filePath),
  writeConfigFile: (filePath, content) => ipcRenderer.invoke("write-config-file", filePath, content),
  mcpListServers: (tool) => ipcRenderer.invoke("mcp-list-servers", tool),
  mcpUpsertServer: (tool, name, entry, enabled) =>
    ipcRenderer.invoke("mcp-upsert-server", tool, name, entry, enabled),
  mcpDeleteServer: (tool, name) => ipcRenderer.invoke("mcp-delete-server", tool, name),
  mcpSetServerEnabled: (tool, name, enabled) =>
    ipcRenderer.invoke("mcp-set-server-enabled", tool, name, enabled),
  mcpRegistryList: (opts) => ipcRenderer.invoke("mcp-registry-list", opts),
  mcpRegistryPreview: (tool, registryId, values) =>
    ipcRenderer.invoke("mcp-registry-preview", tool, registryId, values),
  mcpPingTool: (tool) => ipcRenderer.invoke("mcp-ping-tool", tool),
  openPath: (filePath) => ipcRenderer.invoke("open-path", filePath),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  launchInTerminal: (tool, terminal, cwd, extraArgs) =>
    ipcRenderer.invoke("launch-in-terminal", tool, terminal, cwd, extraArgs),
  ptySpawn: (tool, cwd, extraArgs) => ipcRenderer.invoke("pty-spawn", tool, cwd, extraArgs),
  ptyAttach: (sessionId)                    => ipcRenderer.invoke("pty-attach", sessionId),
  ptyGetOutputBuffer: (sessionId)           => ipcRenderer.invoke("pty-get-output-buffer", sessionId),
  ptyExportOutput: (sessionId, defaultName) => ipcRenderer.invoke("pty-export-output", sessionId, defaultName),
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
  profileGroupGetForest: () => ipcRenderer.invoke("profile-group-get-forest"),
  profileGroupCreate: (name) => ipcRenderer.invoke("profile-group-create", name),
  profileGroupUpdate: (idOrName, newName) =>
    ipcRenderer.invoke("profile-group-update", idOrName, newName),
  profileGroupDelete: (idOrName) => ipcRenderer.invoke("profile-group-delete", idOrName),
  profileGroupReorder: (orderedGroupIds) =>
    ipcRenderer.invoke("profile-group-reorder", orderedGroupIds),
  profileCreate: (name, input) => ipcRenderer.invoke("profile-create", name, input),
  profileUpdate: (profileId, patch) => ipcRenderer.invoke("profile-update", profileId, patch),
  profileDelete: (profileId) => ipcRenderer.invoke("profile-delete", profileId),
  profileReorder: (groupIdOrName, orderedProfileIds) =>
    ipcRenderer.invoke("profile-reorder", groupIdOrName, orderedProfileIds),
  exportBackup: (localStorage) => ipcRenderer.invoke("export-backup", localStorage),
  importBackup: () => ipcRenderer.invoke("import-backup"),
  configSnapshotList: () => ipcRenderer.invoke("config-snapshot-list"),
  configSnapshotCreate: (label) => ipcRenderer.invoke("config-snapshot-create", label),
  configSnapshotRestore: (id) => ipcRenderer.invoke("config-snapshot-restore", id),
  configSnapshotDelete: (id) => ipcRenderer.invoke("config-snapshot-delete", id),
  configSnapshotDiff: (idA, idB) => ipcRenderer.invoke("config-snapshot-diff", idA, idB),
  configSnapshotExport: (id) => ipcRenderer.invoke("config-snapshot-export", id),
  configSnapshotImport: (label) => ipcRenderer.invoke("config-snapshot-import", label),
  relaunchApp: () => ipcRenderer.invoke("relaunch-app"),
  setSystemTrayEnabled: (enabled) => ipcRenderer.invoke("set-system-tray-enabled", enabled),
  getSystemTrayEnabled: () => ipcRenderer.invoke("get-system-tray-enabled"),
  setPtyBufferMaxChars: (chars) => ipcRenderer.invoke("set-pty-buffer-max-chars", chars),
  getPtyBufferMaxChars: () => ipcRenderer.invoke("get-pty-buffer-max-chars"),
  showPaneAgentNotification: (payload) => ipcRenderer.invoke("show-pane-agent-notification", payload),
  setTrayPaneAttention: (count) => ipcRenderer.invoke("set-tray-pane-attention", count),
  openChatWindow: () => ipcRenderer.invoke("open-chat-window"),
  openSettingsWindow: () => ipcRenderer.invoke("open-settings-window"),
  notifySettingsChanged: () => ipcRenderer.invoke("notify-settings-changed"),
  toggleDevTools: () => ipcRenderer.invoke("toggle-devtools"),
  onTrayActivateProfile: (cb) => {
    const handler = (_e, profileId) => cb(profileId);
    ipcRenderer.on("tray-activate-profile", handler);
    return () => ipcRenderer.off("tray-activate-profile", handler);
  },
  onPaneAgentFocus: (cb) => {
    const handler = (_e, paneId) => cb(paneId);
    ipcRenderer.on("pane-agent-focus", handler);
    return () => ipcRenderer.off("pane-agent-focus", handler);
  },
  onProfileLayoutFlush: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("profile-layout-flush", handler);
    return () => ipcRenderer.off("profile-layout-flush", handler);
  },
  sendProfileLayoutFlushDone: () => ipcRenderer.send("profile-layout-flush-done"),
  usageGetProviders: () => ipcRenderer.invoke("usage-get-providers"),
  usageGetCredentialStatus: () => ipcRenderer.invoke("usage-get-credential-status"),
  usageSetCredential: (tool, fieldKey, value) =>
    ipcRenderer.invoke("usage-set-credential", tool, fieldKey, value),
  usageClearCredential: (tool) => ipcRenderer.invoke("usage-clear-credential", tool),
  usageTestCredential: (tool, fieldKey) => ipcRenderer.invoke("usage-test-credential", tool, fieldKey),
  usageFetchDashboard: (opts) => ipcRenderer.invoke("usage-fetch-dashboard", opts),
  authReportSession: (report) => ipcRenderer.invoke("auth-report-session", report),
  authClearSession: () => ipcRenderer.invoke("auth-clear-session"),
  authGetState: (configured) => ipcRenderer.invoke("auth-get-state", configured),
  authGetIdToken: () => ipcRenderer.invoke("auth-get-id-token"),
  authNotifyTokenRefreshFailed: () => ipcRenderer.invoke("auth-notify-token-refresh-failed"),
  authOpenGoogleWindow: () => ipcRenderer.invoke("auth-open-google-window"),
  authFinishGoogleWindow: (result) => ipcRenderer.invoke("auth-finish-google-window", result),
  onAuthStateChanged: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("auth-state-changed", handler);
    return () => ipcRenderer.off("auth-state-changed", handler);
  },
  onAuthRefreshTokenRequest: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("auth-refresh-token-request", handler);
    return () => ipcRenderer.off("auth-refresh-token-request", handler);
  },
  onAuthOAuthNavigated: (cb) => {
    const handler = (_e, url) => cb(url);
    ipcRenderer.on("auth-oauth-navigated", handler);
    return () => ipcRenderer.off("auth-oauth-navigated", handler);
  },
  syncExportLocal: () => ipcRenderer.invoke("sync-export-local"),
  syncApplyBundle: (bundle) => ipcRenderer.invoke("sync-apply-bundle", bundle),
  syncGetMeta: () => ipcRenderer.invoke("sync-get-meta"),
  syncSetMeta: (partial) => ipcRenderer.invoke("sync-set-meta", partial),
  syncPullRemote: () => ipcRenderer.invoke("sync-pull-remote"),
  syncPushRemote: (payload) => ipcRenderer.invoke("sync-push-remote", payload),
  onSyncDataApplied: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("sync-data-applied", handler);
    return () => ipcRenderer.off("sync-data-applied", handler);
  },
  onSettingsChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("settings-changed", handler);
    return () => ipcRenderer.off("settings-changed", handler);
  },
  flowList: () => ipcRenderer.invoke("flow-list"),
  flowListActiveRuns: () => ipcRenderer.invoke("flow-list-active-runs"),
  flowReadFile: (flowId) => ipcRenderer.invoke("flow-read-file", flowId),
  flowReadRunOutput: (runId) => ipcRenderer.invoke("flow-read-run-output", runId),
  flowGetLatestRunOutput: (flowId) => ipcRenderer.invoke("flow-get-latest-run-output", flowId),
  flowRun: (flowId, options) => ipcRenderer.invoke("flow-run", flowId, options),
  flowCancelRun: (flowId) => ipcRenderer.invoke("flow-cancel-run", flowId),
  flowGetTaskSchedulerStatus: () => ipcRenderer.invoke("flow-get-task-scheduler-status"),
  flowInstallTaskScheduler: () => ipcRenderer.invoke("flow-install-task-scheduler"),
  flowRemoveTaskScheduler: () => ipcRenderer.invoke("flow-remove-task-scheduler"),
  flowGetRunState: (runId) => ipcRenderer.invoke("flow-get-run-state", runId),
  flowListRecentRuns: (limit) => ipcRenderer.invoke("flow-list-recent-runs", limit),
  flowListRunsForFlow: (flowId, limit) => ipcRenderer.invoke("flow-list-runs-for-flow", flowId, limit),
  flowGetRunEvents: (runId) => ipcRenderer.invoke("flow-get-run-events", runId),
  flowOpenRunArtifact: (runId, artifact) => ipcRenderer.invoke("flow-open-run-artifact", runId, artifact),
  flowOpenFlowsDir: () => ipcRenderer.invoke("flow-open-flows-dir"),
  flowDelete: (flowId) => ipcRenderer.invoke("flow-delete", flowId),
  flowOpenFile: (flowId) => ipcRenderer.invoke("flow-open-file", flowId),
  flowGetSchedulePrefs: () => ipcRenderer.invoke("flow-get-schedule-prefs"),
  flowSetSchedulePrefs: (partial) => ipcRenderer.invoke("flow-set-schedule-prefs", partial),
  flowRunDue: () => ipcRenderer.invoke("flow-run-due"),
  flowSaveSchedule: (flowId, patch) => ipcRenderer.invoke("flow-save-schedule", flowId, patch),
  flowSaveRunnerSettings: (flowId, patch) =>
    ipcRenderer.invoke("flow-save-runner-settings", flowId, patch),
  flowGenerate: (turns, flowId) => ipcRenderer.invoke("flow-generate", { turns, flowId }),
  flowGetChat: (flowId) => ipcRenderer.invoke("flow-get-chat", flowId),
  flowSaveChat: (flowId, messages) => ipcRenderer.invoke("flow-save-chat", flowId, messages),
  flowListPromptLogs: (flowId, limit) => ipcRenderer.invoke("flow-list-prompt-logs", flowId, limit),
  flowGetDagNodeCommand: (flowId, node, options) =>
    ipcRenderer.invoke("flow-get-dag-node-command", flowId, node, options),
  flowCreate: (content, overwrite) => ipcRenderer.invoke("flow-create", content, overwrite),
  onFlowRunState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("flow-run-state", handler);
    return () => ipcRenderer.off("flow-run-state", handler);
  },
});

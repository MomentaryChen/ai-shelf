import { app, BrowserWindow, ipcMain, shell, dialog, Menu, clipboard } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { join, normalize, dirname, basename } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { execSync, spawn } from "node:child_process";
import {
  detectAll,
  detectTool,
  enrichEntryModels,
  shouldEnrichModels,
  DETECTORS,
} from "../inventory/index.js";
import type { ProviderEntry } from "../inventory/types.js";
import { sortProviderEntries } from "../tool-sort.js";
import { canonicalToolId, TOOL_LAUNCH_CMD, TOOL_UPDATE } from "../tools.js";
import { resolveToolLaunchCommand } from "../tool-launch.js";
import { run } from "../utils/exec.js";
import { formatGitBuildLabel, readGitBuildInfo } from "../utils/git-build-info.js";
import {
  fetchRemoteLatestVersion,
  resolveToolLatestVersion,
} from "../utils/latest-version.js";
import { getMcpConfigPath, tryReadJson, backupFile, writeJson, parseJsonLoose } from "../utils/config.js";
import {
  collectAllMcpServers,
  readMcpServers,
  SYNC_TOOLS,
  writeMcpServers,
} from "../utils/mcp-sync.js";
import {
  collectAllSkills,
  getSkillWriteRoot,
  readSkillsForTool,
  SYNC_SKILL_TOOLS,
  writeSkillsToTool,
} from "../utils/skills-sync.js";
import {
  evaluateTeamPolicy,
  filterAllowedMcpNames,
  filterAllowedSkillNames,
  type TeamPolicy,
} from "../shared/team-policy.js";
import {
  exportTeamPolicyToPath,
  getTeamPolicyPath,
  importTeamPolicyFromPath,
  readTeamPolicy,
  writeTeamPolicy,
} from "../utils/team-policy-store.js";
import {
  buildConfigAlignGaps,
  mcpMissingFromTargets,
  resolveMcpSource,
  resolveSkillsSource,
  skillsMissingFromTargets,
} from "../utils/config-policy-diff.js";
import {
  deleteMcpServer,
  listMcpServersDetailed,
  setMcpServerEnabled,
  upsertMcpServer,
} from "../utils/mcp-edit.js";
import { getMcpRegistryInstallPreview, listMcpRegistryServers } from "../utils/mcp-registry.js";
import { pingToolServers } from "../utils/mcp-ping.js";
import { setCodexModel } from "../utils/mcp-codex-toml.js";
import {
  NO_SUITABLE_UNIX_SHELL_ERROR,
  NO_SUITABLE_WINDOWS_SHELL_ERROR,
  resolvePtySpawnPlan,
  type GroupLayoutSnapshot,
} from "ai-shelf";
import { searchPtyOutput } from "../shared/pty-output-search.js";
import {
  ensureShellIntegrationScripts,
  psSingleQuote,
} from "./shell-integration.js";
import {
  checkAppUpdate,
  downloadAppUpdate,
  getAppUpdateState,
  getDesktopSelfLatestVersion,
  initAppUpdater,
  isDesktopAutoUpdateEnabled,
  isDesktopUpdateDownloaded,
  onAppUpdateCheckSettled,
  quitAndInstallAppUpdate,
  scheduleStartupUpdateCheck,
  syncAppUpdateUiToRenderer,
} from "./app-updater.js";
import {
  getWorkspaceContext,
  closeWorkspaceContext,
  getWorkspaceTree,
  getGroupLayout,
  saveGroupLayout,
  setLastActiveGroup,
  getOnboardingCompleted,
  setOnboardingCompleted,
  getProfileForest,
  getProfileTree,
  createProfileGroup,
  updateProfileGroup,
  deleteProfileGroup,
  reorderProfileGroups,
  createProfile,
  updateProfile,
  setProfileSavedCommands,
  deleteProfile,
  reorderProfiles,
} from "./workspace-host.js";
import { applyBackup, createJsonBackup, createZipBackup } from "./backup-service.js";
import {
  createConfigSnapshot,
  deleteConfigSnapshot,
  diffConfigSnapshots,
  exportConfigSnapshotBundle,
  importConfigSnapshotBundle,
  listConfigSnapshots,
  restoreConfigSnapshot,
} from "./config-snapshot-service.js";
import { CONFIG_SNAPSHOT_BUNDLE_EXT } from "../shared/config-snapshot-keys.js";
import {
  applySystemTrayEnabled,
  bindMinimizeToTray,
  isSystemTrayEnabled,
  refreshTrayMenu,
  setAppQuitting,
  setMinimizeToTrayEnabled,
  type TrayDeps,
} from "./tray.js";
import { showPaneAgentNotification, syncTrayPaneAttention } from "./agent-notify.js";
import { readSystemTrayEnabledFromDisk, writeSystemTrayEnabledToDisk } from "./tray-pref.js";
import { registerAuthHandlers } from "./auth-handlers.js";
import { registerSettingsHandlers } from "./settings-handlers.js";
import { registerSyncHandlers } from "./sync-handlers.js";
import { getRendererPageUrl, startRendererServer, stopRendererServer } from "./renderer-server.js";
import { RENDERER_SESSION_PARTITION } from "./session-partition.js";
import { registerUsageHandlers } from "./usage-handlers.js";

/** OAuth redirect/popup chains need third-party cookies in embedded Chromium. */
app.commandLine.appendSwitch(
  "disable-features",
  "BlockThirdPartyCookies,ThirdPartyStoragePartitioning,PartitionedCookies",
);
import { runChecksForEntry } from "./doctor-checks.js";
import {
  applyHealthMonitorPrefs,
  getHealthMonitorState,
  initHealthMonitor,
  onAppUpdateStateChanged,
  runHealthCheck,
} from "./health-monitor.js";
import {
  deleteFlow,
  deleteFlowChatData,
  createFlowFromContent,
  FLOW_CHAT_DRAFT_ID,
  getFlowDagNodeCommand,
  getFlowFilePath,
  getFlowRunState,
  getRunArtifactPath,
  getRunEvents,
  getFlowsDir,
  initFlowService,
  installBundledFlowTemplate,
  listBundledFlowTemplates,
  listFlows,
  listActiveFlowRuns,
  listFlowPromptLogs,
  listRecentRuns,
  listRunsForFlow,
  onFlowRunState,
  onFlowConsoleChunk,
  getFlowConsoleBuffer,
  readFlowFile,
  readRunOutput,
  getLatestRunWithOutput,
  readFlowChat,
  runDueFlows,
  runFlow,
  cancelFlowRun,
  approveFlowGate,
  rejectFlowGate,
  saveFlowSchedule,
  saveFlowRunner,
  saveFlowChat,
} from "./flow-service.js";
import {
  getFlowTaskSchedulerStatus,
  installFlowTaskScheduler,
  removeFlowTaskScheduler,
} from "./flow-task-scheduler.js";
import { generateFlowFromChat } from "../flow/generate.js";
import type { FlowChatMessage } from "../shared/flow-chat-types.js";
import { initFlowScheduler, stopFlowScheduler } from "./flow-scheduler.js";
import {
  readFlowSchedulePrefs,
  writeFlowSchedulePrefs,
} from "../shared/flow-schedule-pref.js";
import { previewMcpSync } from "../utils/mcp-sync-preview.js";

registerAuthHandlers();
registerSettingsHandlers();
registerSyncHandlers();
registerUsageHandlers();

/** Update commands for each AI tool */
const TOOL_UPDATE_COMMANDS: Record<string, { check: string[]; update: string[]; label: string }> =
  Object.fromEntries(
    Object.entries(TOOL_UPDATE).map(([tool, cfg]) => [
      tool,
      {
        check: [cfg.cmd, "--version"],
        update: [cfg.cmd, ...cfg.args],
        label: cfg.label,
      },
    ]),
  );

let mainWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

function getTrayDeps(): TrayDeps {
  return {
    iconPath: APP_ICON,
    getMainWindow: () => mainWindow,
    getChatWindow: () => chatWindow,
    createChatWindow,
  };
}

const RENDERER_DIR = join(import.meta.dirname, "..", "renderer");
/** Windows prefers .ico; macOS/Linux use PNG (also used by electron-builder). */
const APP_ICON = join(
  import.meta.dirname,
  "..",
  "assets",
  process.platform === "win32" ? "icon.ico" : "icon.png",
);

const sharedWebPreferences = {
  preload: join(import.meta.dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  partition: RENDERER_SESSION_PARTITION,
  /** Required for Firebase Google sign-in popup windows. */
  nativeWindowOpen: true,
} as const;

/** Window title: app name + version (+ dev git label). Version lives here only — not duplicated in the in-app header. */
function formatWindowTitle(base: string): string {
  let title = base;
  try {
    title = `${base} v${app.getVersion()}`;
  } catch {
    /* keep base */
  }
  const gitRoot = app.isPackaged ? app.getAppPath() : process.cwd();
  const gitLabel = formatGitBuildLabel(readGitBuildInfo(gitRoot));
  if (gitLabel) {
    title += ` — ${gitLabel}`;
  }
  return title;
}

/**
 * Packaged builds run as a single process: a second launch focuses the existing
 * instance instead of opening another window. In dev (`electron:dev`, i.e.
 * `!app.isPackaged`) we skip the lock so multiple independent instances can run
 * side by side — `gotSingleInstanceLock` stays true there so the whenReady/activate
 * guards below don't bail out. Note: dev instances share the same userData dir / SQLite DB.
 */
const gotSingleInstanceLock = app.isPackaged ? app.requestSingleInstanceLock() : true;
if (app.isPackaged) {
  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });
  }
}

const INVENTORY_CACHE_TTL_MS = 30_000;
let inventoryCache: { at: number; entries: ProviderEntry[] } | null = null;

type PtyModule = typeof import("node-pty");
let ptyModule: PtyModule | null = null;

async function getPty(): Promise<PtyModule> {
  if (!ptyModule) {
    try {
      ptyModule = await import("node-pty");
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `node-pty native module is not available for Electron. Run: pnpm run rebuild:native:all\n${detail}`,
      );
    }
  }
  return ptyModule;
}

function getCachedInventory(): ProviderEntry[] | null {
  if (inventoryCache && Date.now() - inventoryCache.at < INVENTORY_CACHE_TTL_MS) {
    return inventoryCache.entries;
  }
  return null;
}

function setInventoryCache(entries: ProviderEntry[]) {
  inventoryCache = { at: Date.now(), entries };
}

function mergeInventoryEntry(entries: ProviderEntry[], entry: ProviderEntry): ProviderEntry[] {
  const i = entries.findIndex((e) => e.tool === entry.tool);
  if (i >= 0) {
    const next = [...entries];
    next[i] = entry;
    return sortProviderEntries(next);
  }
  return sortProviderEntries([...entries, entry]);
}

function toggleDevTools(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return;
  win.webContents.toggleDevTools();
}

/** F12 / Ctrl+Shift+I — Electron does not enable these by default. */
function bindDevToolsShortcuts(win: BrowserWindow) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key;
    const f12 = key === "F12";
    const ctrlShiftI =
      (input.control || input.meta) && input.shift && key.toLowerCase() === "i";
    if (f12 || ctrlShiftI) {
      event.preventDefault();
      toggleDevTools(win);
    }
  });
}

function setupAppMenu() {
  const isMac = process.platform === "darwin";
  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: "reload" },
    { role: "forceReload" },
    { type: "separator" },
    {
      label: "Developer Tools",
      accelerator: "F12",
      click: (_item, win) => {
        const bw = win && "webContents" in win ? (win as BrowserWindow) : null;
        toggleDevTools(bw);
      },
    },
    {
      label: "Developer Tools (Alt)",
      accelerator: "CmdOrCtrl+Shift+I",
      click: (_item, win) => {
        const bw = win && "webContents" in win ? (win as BrowserWindow) : null;
        toggleDevTools(bw);
      },
    },
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];

  // Copy/paste accelerators are handled in xterm (see xterm-clipboard.ts).
  // Menu roles with CmdOrCtrl+C/V would fire twice alongside the terminal handler.
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { label: "View", submenu: viewSubmenu },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function isOAuthNavigationUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) return true;
    if (hostname.endsWith(".firebaseapp.com")) return true;
    if (hostname.endsWith(".google.com") || hostname === "google.com") return true;
    if (hostname.endsWith(".googleapis.com")) return true;
    if (hostname.endsWith(".gstatic.com")) return true;
  } catch {
    return false;
  }
  return false;
}

function allowOAuthPopupWindows(win: BrowserWindow): void {
  const popupOptions = {
    width: 520,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: { ...sharedWebPreferences },
  } as const;

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Firebase opens about:blank before navigating to Google.
    if (!url || url === "about:blank") {
      return { action: "allow" as const, overrideBrowserWindowOptions: popupOptions };
    }
    if (!isOAuthNavigationUrl(url)) return { action: "deny" as const };
    return { action: "allow" as const, overrideBrowserWindowOptions: popupOptions };
  });
}

function allowOAuthNavigation(win: BrowserWindow): void {
  const onNavigate = (event: Electron.Event, url: string) => {
    if (isOAuthNavigationUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  };
  win.webContents.on("will-navigate", onNavigate);
  win.webContents.on("will-redirect", onNavigate);
}

app.on("browser-window-created", (_event, win) => {
  allowOAuthPopupWindows(win);
  allowOAuthNavigation(win);
});

/** Keep formatted title; renderer index.html <title> would otherwise reset it to "AI Shelf". */
function bindWindowTitle(win: BrowserWindow, base: string): void {
  const apply = () => {
    if (!win.isDestroyed()) win.setTitle(formatWindowTitle(base));
  };
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    apply();
  });
  win.webContents.on("did-finish-load", apply);
}

function attachWindow(win: BrowserWindow, titleBase: string) {
  bindDevToolsShortcuts(win);
  bindWindowTitle(win, titleBase);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: formatWindowTitle("AI Shelf"),
    icon: APP_ICON,
    webPreferences: sharedWebPreferences,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
  });

  mainWindow.loadURL(getRendererPageUrl());
  attachWindow(mainWindow, "AI Shelf");
  bindMinimizeToTray(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.focus();
    return;
  }
  chatWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: formatWindowTitle("AI Terminal"),
    icon: APP_ICON,
    webPreferences: sharedWebPreferences,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
  });
  chatWindow.loadURL(getRendererPageUrl("chat"));
  attachWindow(chatWindow, "AI Terminal");
  bindMinimizeToTray(chatWindow);
  chatWindow.on("closed", () => {
    chatWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 440,
    minHeight: 560,
    title: formatWindowTitle("Terminal Settings"),
    icon: APP_ICON,
    webPreferences: sharedWebPreferences,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
  });
  settingsWindow.loadURL(getRendererPageUrl("settings"));
  attachWindow(settingsWindow, "Terminal Settings");
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

ipcMain.handle("open-chat-window", () => {
  createChatWindow();
});

ipcMain.handle("open-settings-window", () => {
  createSettingsWindow();
});

ipcMain.handle("toggle-devtools", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  toggleDevTools(win);
});

// IPC handlers
ipcMain.handle("get-inventory", async () => {
  const cached = getCachedInventory();
  if (cached) return cached;
  const entries = await detectAll({ quick: true });
  setInventoryCache(entries);
  return entries;
});

ipcMain.handle("start-inventory-scan", async (event) => {
  const push = (channel: string, payload: unknown) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
  };

  let entries: ProviderEntry[] = getCachedInventory() ?? [];
  if (entries.length > 0) {
    for (const entry of entries) push("inventory-entry", entry);
  } else {
    await Promise.all(
      DETECTORS.map(async (detect) => {
        try {
          const entry = await detect({ quick: true });
          entries = mergeInventoryEntry(entries, entry);
          push("inventory-entry", entry);
        } catch { /* skip failed detectors */ }
      }),
    );
    setInventoryCache(entries);
  }

  const enrichCount = entries.filter(shouldEnrichModels).length;
  push("inventory-complete", { count: enrichCount });

  // Background: remote model lists only (tools with credentials or Cursor CLI)
  void Promise.all(
    entries.filter(shouldEnrichModels).map(async (entry) => {
      try {
        const enriched = await enrichEntryModels(entry);
        entries = mergeInventoryEntry(entries, enriched);
        setInventoryCache(entries);
        push("inventory-enriched", enriched);
      } catch { /* keep quick entry */ }
    }),
  );
});

ipcMain.handle("clear-inventory-cache", () => {
  inventoryCache = null;
});

/** Shared: run doctor checks for a single inventory entry */
async function runDoctorForEntry(entry: Awaited<ReturnType<typeof detectAll>>[number]) {
  return runChecksForEntry(entry);
}

ipcMain.handle("run-doctor", async () => {
  const entries = getCachedInventory() ?? await detectAll({ quick: true });
  if (!getCachedInventory()) setInventoryCache(entries);
  return Promise.all(entries.map(runDoctorForEntry));
});

ipcMain.handle("doctor-tool", async (_event, tool: string) => {
  let entry = getCachedInventory()?.find((e) => e.tool === tool);
  if (!entry) {
    const detected = await detectTool(tool, { quick: true });
    if (!detected) {
      return { tool, checks: [{ name: "error", status: "fail", detail: `Tool "${tool}" not found` }] };
    }
    entry = detected;
    setInventoryCache(mergeInventoryEntry(getCachedInventory() ?? [], entry));
  }
  return runDoctorForEntry(entry);
});

ipcMain.handle("get-env-vars", () => {
  const env = (key: string) => {
    const value = process.env[key];
    return { key, set: !!value, value };
  };
  return [
    {
      provider: "Claude",
      vars: [env("ANTHROPIC_API_KEY"), env("ANTHROPIC_BASE_URL")],
    },
    {
      provider: "Copilot",
      vars: [env("GH_TOKEN"), env("GITHUB_TOKEN"), env("COPILOT_HOME")],
    },
    {
      provider: "Cursor",
      vars: [env("CURSOR_API_KEY")],
    },
    {
      provider: "Codex",
      vars: [env("OPENAI_API_KEY")],
    },
    {
      provider: "Gemini",
      vars: [env("GEMINI_API_KEY"), env("GOOGLE_API_KEY")],
    },
    {
      provider: "Aider",
      vars: [
        env("ANTHROPIC_API_KEY"),
        env("OPENAI_API_KEY"),
        env("DEEPSEEK_API_KEY"),
        env("OPENROUTER_API_KEY"),
      ],
    },
  ];
});

ipcMain.handle("check-update", async () => {
  const results: {
    tool: string;
    label: string;
    currentVersion: string | null;
    latestVersion: string | null;
    available: boolean;
    updateCommand: string;
  }[] = [];

  let entries: Awaited<ReturnType<typeof detectAll>> = [];
  try {
    entries = await detectAll({ quick: true });
    setInventoryCache(entries);
  } catch {
    entries = getCachedInventory() ?? [];
  }

  const installedEntries = entries.filter((e) => e.available);
  const latestVersionMap: Record<string, string | null> = {};
  await Promise.all(
    installedEntries.map(async (entry) => {
      latestVersionMap[entry.tool] = await fetchRemoteLatestVersion(entry.tool);
    }),
  );

  for (const entry of entries) {
    const cfg = TOOL_UPDATE_COMMANDS[entry.tool];
    results.push({
      tool: entry.tool,
      label: cfg?.label ?? entry.provider,
      currentVersion: entry.version ?? null,
      latestVersion: resolveToolLatestVersion(
        entry.tool,
        entry.available,
        entry.version ?? null,
        latestVersionMap[entry.tool],
        true,
      ),
      available: entry.available,
      updateCommand: cfg ? cfg.update.join(" ") : "",
    });
  }

  const selfLatest = app.isPackaged
    ? await resolveDesktopSelfLatestVersion()
    : null;
  results.push(buildAiShelfSelfEntry(selfLatest));

  return { tools: results };
});

/** Re-detect one tool's installed version and remote latest (after a single-tool update). */
ipcMain.handle("refresh-tool-update-info", async (_event, tool: string) => {
  if (tool === "ai-shelf") {
    const selfLatest = app.isPackaged ? await resolveDesktopSelfLatestVersion() : null;
    return buildAiShelfSelfEntry(selfLatest);
  }

  const detected = await detectTool(tool, { quick: true });
  if (!detected) return null;

  const cfg = TOOL_UPDATE_COMMANDS[detected.tool] ?? TOOL_UPDATE_COMMANDS[tool];
  const remoteLatest = await fetchRemoteLatestVersion(detected.tool);
  const latestVersion = resolveToolLatestVersion(
    detected.tool,
    detected.available,
    detected.version ?? null,
    remoteLatest,
    true,
  );

  const cached = getCachedInventory();
  if (cached) {
    setInventoryCache(mergeInventoryEntry(cached, detected));
  }

  return {
    tool: detected.tool,
    label: cfg?.label ?? detected.provider,
    currentVersion: detected.version ?? null,
    latestVersion,
    available: detected.available,
    updateCommand: cfg ? cfg.update.join(" ") : "",
  };
});

/** Returns tool list with current versions immediately (no npm checks). */
ipcMain.handle("get-tools-list", async () => {
  const results: {
    tool: string;
    label: string;
    currentVersion: string | null;
    latestVersion: string | null;
    available: boolean;
    updateCommand: string;
  }[] = [];

  const entries = getCachedInventory() ?? await detectAll({ quick: true });
  if (!getCachedInventory()) setInventoryCache(entries);
  for (const entry of entries) {
    const cfg = TOOL_UPDATE_COMMANDS[entry.tool];
    results.push({
      tool: entry.tool,
      label: cfg?.label ?? entry.provider,
      currentVersion: entry.version ?? null,
      latestVersion: null,
      available: entry.available,
      updateCommand: cfg ? cfg.update.join(" ") : "",
    });
  }

  results.push(buildAiShelfSelfEntry(null));

  return { tools: results };
});

/**
 * Streaming scan: detects each tool individually and pushes results to renderer
 * as they arrive, then pushes npm latest versions per tool.
 * Renderer listens to "tool-detected" and "tool-latest" events.
 */
ipcMain.handle("start-update-scan", async (event) => {
  type ToolInfo = {
    tool: string; label: string; currentVersion: string | null;
    latestVersion: string | null; available: boolean; updateCommand: string;
    desktopUpdate?: boolean;
  };

  const push = (channel: string, payload: unknown) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
  };

  const selfEntry: ToolInfo = buildAiShelfSelfEntry(null);
  push("tool-detected", selfEntry);

  // Detect each AI tool individually in parallel, push as each resolves
  const allTools: ToolInfo[] = [selfEntry];

  await Promise.all(DETECTORS.map(async (detect) => {
    try {
      const entry = await detect({ quick: true });
      const cfg = TOOL_UPDATE_COMMANDS[entry.tool];
      const info: ToolInfo = {
        tool: entry.tool,
        label: cfg?.label ?? entry.provider,
        currentVersion: entry.version ?? null,
        latestVersion: null,
        available: entry.available,
        updateCommand: cfg ? cfg.update.join(" ") : "",
      };
      allTools.push(info);
      push("tool-detected", info);
    } catch { /* skip failed detectors */ }
  }));

  // Now check npm / GitHub latest (or desktop updater for ai-shelf) — installed tools only
  await Promise.all(allTools.map(async (info) => {
    const { tool, available } = info;
    if (tool !== "ai-shelf" && !available) {
      push("tool-latest", { tool, latestVersion: null });
      return;
    }
    let latestVersion: string | null = null;
    if (tool === "ai-shelf" && app.isPackaged) {
      latestVersion = await resolveDesktopSelfLatestVersion();
    } else if (tool !== "ai-shelf") {
      latestVersion = await fetchRemoteLatestVersion(tool);
    }
    push("tool-latest", { tool, latestVersion });
  }));

  push("scan-complete", null);
});

ipcMain.handle("run-update", async (_event, tool: string) => {
  if (tool === "ai-shelf" && app.isPackaged) {
    if (isDesktopUpdateDownloaded()) {
      syncAppUpdateUiToRenderer();
      return { success: true, message: "Update ready — confirm restart in the dialog." };
    }

    let updateState = getAppUpdateState();
    if (
      updateState.status === "idle" ||
      updateState.status === "not-available" ||
      updateState.status === "checking"
    ) {
      updateState = await checkAppUpdate();
    }

    if (updateState.status === "available") {
      syncAppUpdateUiToRenderer();
      return { success: true, message: "See the update dialog to download." };
    }
    if (updateState.status === "downloading" || updateState.status === "downloaded") {
      syncAppUpdateUiToRenderer();
      return {
        success: true,
        message:
          updateState.status === "downloaded"
            ? "Update ready — confirm restart in the dialog."
            : "Update download in progress — see the dialog.",
      };
    }
    if (updateState.status === "error") {
      syncAppUpdateUiToRenderer();
      return {
        success: false,
        message: updateState.error ?? "Update check failed.",
      };
    }
    return {
      success: false,
      message: "No desktop update available.",
    };
  }

  const cliPath = join(import.meta.dirname, "..", "cli.js");
  const cliArg = tool === "ai-shelf" ? "self" : tool;
  const result = await run(process.execPath, [cliPath, "update", cliArg], 60_000, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  if (result.ok) {
    return { success: true, message: result.stdout || "Update completed" };
  }
  return { success: false, message: result.stderr || result.stdout || "Update failed" };
});

ipcMain.handle("run-install", async (_event, tool: string) => {
  const cliPath = join(import.meta.dirname, "..", "cli.js");
  const cliArg = canonicalToolId(tool);
  const result = await run(process.execPath, [cliPath, "install", cliArg], 180_000, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  if (result.ok) {
    inventoryCache = null;
    return { success: true, message: result.stdout || "Install completed" };
  }
  return { success: false, message: result.stderr || result.stdout || "Install failed" };
});

function detectSelfUpdateCmd(): string {
  for (const pm of ["pnpm", "yarn", "npm"] as const) {
    try {
      execSync(`${pm} --version`, { stdio: "ignore" });
      return pm === "pnpm"
        ? "pnpm update -g ai-shelf"
        : pm === "yarn"
          ? "yarn global upgrade ai-shelf"
          : "npm update -g ai-shelf";
    } catch { /* not available */ }
  }
  return "npm update -g ai-shelf";
}

type SelfUpdateEntry = {
  tool: string;
  label: string;
  currentVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  updateCommand: string;
  desktopUpdate: boolean;
};

function buildAiShelfSelfEntry(latestVersion: string | null = null): SelfUpdateEntry {
  let selfVersion = "unknown";
  try {
    selfVersion = app.getVersion();
  } catch {
    /* ok */
  }

  if (app.isPackaged) {
    return {
      tool: "ai-shelf",
      label: "AI Shelf (desktop)",
      currentVersion: selfVersion,
      latestVersion: latestVersion ?? getDesktopSelfLatestVersion(),
      available: true,
      updateCommand: "",
      desktopUpdate: true,
    };
  }

  return {
    tool: "ai-shelf",
    label: "AI Shelf (self)",
    currentVersion: selfVersion,
    latestVersion,
    available: true,
    updateCommand: detectSelfUpdateCmd(),
    desktopUpdate: false,
  };
}

async function resolveDesktopSelfLatestVersion(): Promise<string | null> {
  await checkAppUpdate();
  return getDesktopSelfLatestVersion();
}

/** Returns only the self (ai-shelf) version and update command — no detectAll(). */
ipcMain.handle("get-self-info", () => {
  let version = "unknown";
  try { version = app.getVersion(); } catch { /* ok */ }
  const git = app.isPackaged
    ? { branch: null, commitShort: null, dirty: false }
    : readGitBuildInfo(app.getAppPath());
  return {
    version,
    updateCommand: app.isPackaged ? "" : detectSelfUpdateCmd(),
    desktopUpdate: app.isPackaged,
    branch: git.branch,
    commitShort: git.commitShort,
    dirty: git.dirty,
  };
});

ipcMain.handle("get-app-update-channel", () => ({
  isPackaged: app.isPackaged,
  desktopAutoUpdate: isDesktopAutoUpdateEnabled(),
}));

ipcMain.handle("check-app-update", () => checkAppUpdate());

ipcMain.handle("get-app-update-state", () => getAppUpdateState());

ipcMain.handle("confirm-app-update-download", () => {
  downloadAppUpdate();
  return { ok: true };
});

ipcMain.handle("quit-and-install-app-update", () => {
  quitAndInstallAppUpdate();
  return { ok: true };
});

// --- MCP Sync ---

ipcMain.handle("get-mcp-raw", async () => {
  const rows = await Promise.all(
    SYNC_TOOLS.map(async (tool) => ({
      tool,
      servers: readMcpServers(tool),
      configPath: getMcpConfigPath(tool),
    })),
  );
  return Object.fromEntries(rows.map(({ tool, servers, configPath }) => [tool, { servers, configPath }]));
});

ipcMain.handle("sync-mcp", async (_event, opts: {
  serverNames: string[];
  targetTools: string[];
  sourceTool?: string;
}) => {
  const policy = readTeamPolicy();
  const sourceTool = opts.sourceTool || resolveMcpSource(policy);
  const serverNames = filterAllowedMcpNames(policy, opts.serverNames);
  const allServers = collectAllMcpServers(sourceTool);

  const results: { tool: string; added: string[]; skipped: string[]; error?: string }[] = [];

  for (const tool of opts.targetTools) {
    results.push({ tool, ...writeMcpServers(tool, serverNames, allServers) });
  }

  return results;
});

ipcMain.handle("preview-mcp-sync", (_event, opts: {
  serverNames: string[];
  targetTools: string[];
  sourceTool?: string;
}) => {
  const policy = readTeamPolicy();
  const sourceTool = opts.sourceTool || resolveMcpSource(policy);
  return previewMcpSync({ ...opts, sourceTool, policy });
});

// --- Team config policy ---

ipcMain.handle("get-team-policy", () => ({
  policy: readTeamPolicy(),
  path: getTeamPolicyPath(),
}));

ipcMain.handle("set-team-policy", (_event, policy: unknown) => {
  if (!policy || typeof policy !== "object") {
    return { ok: false, policy: readTeamPolicy(), path: getTeamPolicyPath(), error: "Invalid policy" };
  }
  const next = writeTeamPolicy(policy as TeamPolicy);
  return { ok: true, policy: next, path: getTeamPolicyPath() };
});

ipcMain.handle("evaluate-team-policy", () => {
  const policy = readTeamPolicy();
  const mcpByTool = Object.fromEntries(
    SYNC_TOOLS.map((tool) => [tool, Object.keys(readMcpServers(tool))]),
  );
  const skillsByTool = Object.fromEntries(
    SYNC_SKILL_TOOLS.map((tool) => [tool, Object.keys(readSkillsForTool(tool))]),
  );
  return {
    policy,
    path: getTeamPolicyPath(),
    violations: evaluateTeamPolicy(policy, mcpByTool, skillsByTool),
  };
});

ipcMain.handle("get-config-align-gaps", (_event, opts?: {
  mcpSourceTool?: string;
  skillsSourceTool?: string;
  mcpTargets?: string[];
  skillTargets?: string[];
}) => {
  const policy = readTeamPolicy();
  return {
    policy,
    gaps: buildConfigAlignGaps({
      policy,
      mcpSourceTool: opts?.mcpSourceTool,
      skillsSourceTool: opts?.skillsSourceTool,
      mcpTargets: opts?.mcpTargets,
      skillTargets: opts?.skillTargets,
    }),
    mcpSource: resolveMcpSource(policy, opts?.mcpSourceTool),
    skillsSource: resolveSkillsSource(policy, opts?.skillsSourceTool),
  };
});

ipcMain.handle("import-team-policy", async () => {
  const parent = BrowserWindow.getFocusedWindow();
  const options = {
    title: "Import team policy",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile" as const],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, policy: readTeamPolicy(), path: getTeamPolicyPath(), canceled: true };
  }
  const imported = importTeamPolicyFromPath(result.filePaths[0]);
  return { ...imported, path: getTeamPolicyPath(), canceled: false };
});

ipcMain.handle("export-team-policy", async () => {
  const parent = BrowserWindow.getFocusedWindow();
  const options = {
    title: "Export team policy",
    defaultPath: "ai-shelf-team-policy.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  };
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }
  return { ...exportTeamPolicyToPath(result.filePath), canceled: false };
});

// --- Health monitor ---

ipcMain.handle("get-health-monitor-state", () => getHealthMonitorState());

ipcMain.handle("run-health-check", () => runHealthCheck());

ipcMain.handle("set-health-monitor-prefs", (_event, partial: unknown) => {
  if (!partial || typeof partial !== "object") {
    return { ok: false, prefs: getHealthMonitorState().prefs };
  }
  const p = partial as Record<string, unknown>;
  const patch: Record<string, boolean> = {};
  if (typeof p.backgroundChecksEnabled === "boolean") {
    patch.backgroundChecksEnabled = p.backgroundChecksEnabled;
  }
  if (typeof p.trayBadgeEnabled === "boolean") patch.trayBadgeEnabled = p.trayBadgeEnabled;
  if (typeof p.weeklyDoctorSummary === "boolean") patch.weeklyDoctorSummary = p.weeklyDoctorSummary;
  const prefs = applyHealthMonitorPrefs(patch);
  return { ok: true, prefs };
});

// --- Skills Sync ---

ipcMain.handle("get-skills-raw", async () => {
  const rows = await Promise.all(
    SYNC_SKILL_TOOLS.map(async (tool) => ({
      tool,
      skills: readSkillsForTool(tool),
      writeRoot: getSkillWriteRoot(tool),
    })),
  );
  return Object.fromEntries(
    rows.map(({ tool, skills, writeRoot }) => [tool, { skills, writeRoot }]),
  );
});

ipcMain.handle("sync-skills", async (_event, opts: {
  skillNames: string[];
  targetTools: string[];
  sourceTool?: string;
}) => {
  const policy = readTeamPolicy();
  const sourceTool = opts.sourceTool || resolveSkillsSource(policy);
  const skillNames = filterAllowedSkillNames(policy, opts.skillNames);
  const allSkills = collectAllSkills(sourceTool);

  const results: { tool: string; added: string[]; skipped: string[]; error?: string }[] = [];

  for (const tool of opts.targetTools) {
    results.push({ tool, ...writeSkillsToTool(tool, skillNames, allSkills) });
  }

  return results;
});

/** Align missing MCP/skills from source of truth onto targets (missing-only). */
ipcMain.handle("align-config-from-source", async (_event, opts?: {
  mcpSourceTool?: string;
  skillsSourceTool?: string;
  mcpTargets?: string[];
  skillTargets?: string[];
  syncMcp?: boolean;
  syncSkills?: boolean;
}) => {
  const policy = readTeamPolicy();
  const mcpSource = resolveMcpSource(policy, opts?.mcpSourceTool);
  const skillsSource = resolveSkillsSource(policy, opts?.skillsSourceTool);
  const syncMcp = opts?.syncMcp !== false;
  const syncSkills = opts?.syncSkills !== false;

  const mcpTargets = (opts?.mcpTargets ?? [...SYNC_TOOLS]).filter((t) => t !== mcpSource);
  const skillTargets = (opts?.skillTargets ?? [...SYNC_SKILL_TOOLS]).filter(
    (t) => t !== skillsSource,
  );

  const mcpResults: { tool: string; added: string[]; skipped: string[]; error?: string }[] = [];
  const skillResults: { tool: string; added: string[]; skipped: string[]; error?: string }[] = [];

  if (syncMcp) {
    const { byTarget } = mcpMissingFromTargets({
      sourceTool: mcpSource,
      targetTools: mcpTargets,
      policy,
    });
    const allServers = collectAllMcpServers(mcpSource);
    for (const tool of mcpTargets) {
      const names = byTarget[tool] ?? [];
      if (names.length === 0) {
        mcpResults.push({ tool, added: [], skipped: [] });
        continue;
      }
      mcpResults.push({ tool, ...writeMcpServers(tool, names, allServers) });
    }
  }

  if (syncSkills) {
    const { byTarget } = skillsMissingFromTargets({
      sourceTool: skillsSource,
      targetTools: skillTargets,
      policy,
    });
    const allSkills = collectAllSkills(skillsSource);
    for (const tool of skillTargets) {
      const names = byTarget[tool] ?? [];
      if (names.length === 0) {
        skillResults.push({ tool, added: [], skipped: [] });
        continue;
      }
      skillResults.push({ tool, ...writeSkillsToTool(tool, names, allSkills) });
    }
  }

  return { mcpSource, skillsSource, mcpResults, skillResults };
});

// --- In-app config editing & MCP server management ---

ipcMain.handle("read-config-file", (_event, filePath: string) => {
  if (typeof filePath !== "string" || !filePath) {
    return { success: false, error: "Invalid path", content: "", exists: false };
  }
  try {
    if (!existsSync(filePath)) return { success: true, content: "", exists: false };
    return { success: true, content: readFileSync(filePath, "utf-8"), exists: true };
  } catch (err) {
    return { success: false, error: (err as Error).message, content: "", exists: false };
  }
});

ipcMain.handle("write-config-file", (_event, filePath: string, content: string) => {
  if (typeof filePath !== "string" || !filePath) return { success: false, error: "Invalid path" };
  if (typeof content !== "string") return { success: false, error: "Invalid content" };
  try {
    if (filePath.endsWith(".json")) {
      try {
        parseJsonLoose(content);
      } catch (e) {
        return { success: false, error: `Invalid JSON: ${(e as Error).message}` };
      }
    }
    if (existsSync(filePath)) backupFile(filePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("mcp-list-servers", (_event, tool: string) => listMcpServersDetailed(tool));

ipcMain.handle(
  "mcp-upsert-server",
  (_event, tool: string, name: string, entry: Record<string, unknown>, enabled: boolean) =>
    upsertMcpServer(tool, name, entry, enabled),
);

ipcMain.handle("mcp-delete-server", (_event, tool: string, name: string) =>
  deleteMcpServer(tool, name),
);

ipcMain.handle(
  "mcp-set-server-enabled",
  (_event, tool: string, name: string, enabled: boolean) =>
    setMcpServerEnabled(tool, name, enabled),
);

ipcMain.handle("mcp-ping-tool", (_event, tool: string) => pingToolServers(tool));

ipcMain.handle(
  "mcp-registry-list",
  (_event, opts: { search?: string; cursor?: string; limit?: number }) =>
    listMcpRegistryServers(opts),
);

ipcMain.handle(
  "mcp-registry-preview",
  (
    _event,
    tool: string,
    registryId: string,
    values?: { env?: Record<string, string>; packageArgs?: Record<string, string> },
  ) => getMcpRegistryInstallPreview(registryId, tool, values),
);

function normalizeOpenPath(raw: string): string {
  let p = raw.trim();
  if (
    (p.startsWith('"') && p.endsWith('"')) ||
    (p.startsWith("'") && p.endsWith("'"))
  ) {
    p = p.slice(1, -1);
  }
  p = p.replace(/[,;:!?.)]+$/g, "");
  if (/^file:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      p = decodeURIComponent(u.pathname);
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    } catch {
      p = p.replace(/^file:\/\/\/?/i, "");
    }
  }
  return p;
}

ipcMain.handle("open-path", async (_event, rawPath: string) => {
  const filePath = normalizeOpenPath(rawPath);
  if (!filePath) return;
  await shell.openPath(filePath);
});

ipcMain.handle("open-external", async (_event, url: string) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  await shell.openExternal(url);
});

// --- PTY (In-App Terminal) ---

const PLAIN_SHELL_TOOL_ID = "shell";

const PTY_SESSIONS = new Map<string, import("node-pty").IPty>();
const PTY_OUTPUT_BUFFERS = new Map<string, string>();

/** Session metadata kept after exit so the status bar can show pid / shell / size / exit. */
type PtySessionMeta = {
  pid: number | null;
  shell: string;
  cols: number;
  rows: number;
  exitCode: number | null;
};
const PTY_META = new Map<string, PtySessionMeta>();

const DEFAULT_PTY_BUFFER_MAX_CHARS = 4 * 1024 * 1024;
const MIN_PTY_BUFFER_MAX_CHARS = 256 * 1024;
const MAX_PTY_BUFFER_MAX_CHARS = 64 * 1024 * 1024;

let ptyBufferMaxChars = DEFAULT_PTY_BUFFER_MAX_CHARS;

function clampPtyBufferMaxChars(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_PTY_BUFFER_MAX_CHARS;
  return Math.min(MAX_PTY_BUFFER_MAX_CHARS, Math.max(MIN_PTY_BUFFER_MAX_CHARS, Math.round(v)));
}

function setPtyBufferMaxChars(chars: number) {
  ptyBufferMaxChars = clampPtyBufferMaxChars(chars);
  for (const [sessionId, buf] of PTY_OUTPUT_BUFFERS) {
    if (buf.length > ptyBufferMaxChars) {
      const trimmed = buf.slice(-ptyBufferMaxChars);
      PTY_OUTPUT_BUFFERS.set(sessionId, trimmed);
      mirrorPtyLog(sessionId, trimmed);
    }
  }
}

function ptyLogDir(): string {
  return join(app.getPath("userData"), "pty-logs");
}

type PtyLogOp =
  | { kind: "append"; chunk: string }
  | { kind: "rewrite"; text: string }
  | { kind: "clear" };

const PTY_LOG_QUEUES = new Map<string, PtyLogOp[]>();
const PTY_LOG_INFLIGHT = new Map<string, Promise<void>>();
const PTY_LOG_FLUSH_TIMERS = new Map<string, ReturnType<typeof setTimeout>>();
const PTY_LOG_FLUSH_IDLE_MS = 50;

const PTY_DATA_PENDING = new Map<string, string>();
const PTY_DATA_FLUSH_TIMERS = new Map<string, ReturnType<typeof setTimeout>>();
const PTY_DATA_COALESCE_MS = 16;

function enqueuePtyLog(sessionId: string, op: PtyLogOp) {
  let q = PTY_LOG_QUEUES.get(sessionId);
  if (!q) {
    q = [];
    PTY_LOG_QUEUES.set(sessionId, q);
  }
  if (op.kind === "rewrite" || op.kind === "clear") {
    q.length = 0;
    q.push(op);
  } else {
    const last = q.at(-1);
    if (last && last.kind === "append") {
      last.chunk += op.chunk;
    } else {
      q.push(op);
    }
  }
  schedulePtyLogFlush(sessionId);
}

function schedulePtyLogFlush(sessionId: string) {
  if (PTY_LOG_FLUSH_TIMERS.has(sessionId)) return;
  const timer = setTimeout(() => {
    PTY_LOG_FLUSH_TIMERS.delete(sessionId);
    void flushPtyLog(sessionId);
  }, PTY_LOG_FLUSH_IDLE_MS);
  PTY_LOG_FLUSH_TIMERS.set(sessionId, timer);
}

async function flushPtyLog(sessionId: string): Promise<void> {
  const inflight = PTY_LOG_INFLIGHT.get(sessionId);
  if (inflight) {
    schedulePtyLogFlush(sessionId);
    return inflight;
  }
  const q = PTY_LOG_QUEUES.get(sessionId);
  if (!q || q.length === 0) return;

  const run = (async () => {
    const ops = q.splice(0, q.length);
    try {
      const dir = ptyLogDir();
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${sessionId}.log`);
      for (const op of ops) {
        if (op.kind === "clear") {
          try {
            await unlink(file);
          } catch {
            /* ignore */
          }
        } else if (op.kind === "rewrite") {
          await writeFile(file, op.text, "utf8");
        } else if (op.chunk) {
          await appendFile(file, op.chunk, "utf8");
        }
      }
    } catch {
      /* best-effort */
    } finally {
      PTY_LOG_INFLIGHT.delete(sessionId);
      if ((PTY_LOG_QUEUES.get(sessionId)?.length ?? 0) > 0) {
        schedulePtyLogFlush(sessionId);
      } else {
        PTY_LOG_QUEUES.delete(sessionId);
      }
    }
  })();

  PTY_LOG_INFLIGHT.set(sessionId, run);
  await run;
}

/** Drain queued + in-flight log ops so callers (e.g. get-log-path) see a consistent file. */
async function flushPtyLogNow(sessionId: string): Promise<void> {
  for (;;) {
    const timer = PTY_LOG_FLUSH_TIMERS.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      PTY_LOG_FLUSH_TIMERS.delete(sessionId);
    }
    const inflight = PTY_LOG_INFLIGHT.get(sessionId);
    if (inflight) {
      await inflight;
      continue;
    }
    if ((PTY_LOG_QUEUES.get(sessionId)?.length ?? 0) === 0) return;
    await flushPtyLog(sessionId);
  }
}

/** Rewrite the mirrored log to match the in-memory PTY tail (queued, async). */
function mirrorPtyLog(sessionId: string, text: string) {
  enqueuePtyLog(sessionId, { kind: "rewrite", text });
}

function mirrorPtyLogAppend(sessionId: string, chunk: string) {
  if (!chunk) return;
  enqueuePtyLog(sessionId, { kind: "append", chunk });
}

function appendPtyBuffer(sessionId: string, data: string) {
  const prev = PTY_OUTPUT_BUFFERS.get(sessionId) ?? "";
  let next = prev + data;
  if (next.length > ptyBufferMaxChars) {
    next = next.slice(-ptyBufferMaxChars);
    PTY_OUTPUT_BUFFERS.set(sessionId, next);
    mirrorPtyLog(sessionId, next);
    return;
  }
  PTY_OUTPUT_BUFFERS.set(sessionId, next);
  mirrorPtyLogAppend(sessionId, data);
}

function sendPtyData(sessionId: string, data: string) {
  if (!data) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("pty-data", { sessionId, data });
    }
  }
}

function flushPtyDataBroadcast(sessionId: string) {
  const timer = PTY_DATA_FLUSH_TIMERS.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    PTY_DATA_FLUSH_TIMERS.delete(sessionId);
  }
  const data = PTY_DATA_PENDING.get(sessionId);
  PTY_DATA_PENDING.delete(sessionId);
  if (data) sendPtyData(sessionId, data);
}

function clearPtyBuffer(sessionId: string) {
  // Deliver any coalesced chunks before dropping the in-memory buffer.
  flushPtyDataBroadcast(sessionId);
  PTY_OUTPUT_BUFFERS.delete(sessionId);
  const logTimer = PTY_LOG_FLUSH_TIMERS.get(sessionId);
  if (logTimer) {
    clearTimeout(logTimer);
    PTY_LOG_FLUSH_TIMERS.delete(sessionId);
  }
  enqueuePtyLog(sessionId, { kind: "clear" });
}

function broadcastPtyData(sessionId: string, data: string) {
  appendPtyBuffer(sessionId, data);
  const prev = PTY_DATA_PENDING.get(sessionId) ?? "";
  PTY_DATA_PENDING.set(sessionId, prev + data);
  if (PTY_DATA_FLUSH_TIMERS.has(sessionId)) return;
  const timer = setTimeout(() => {
    flushPtyDataBroadcast(sessionId);
  }, PTY_DATA_COALESCE_MS);
  PTY_DATA_FLUSH_TIMERS.set(sessionId, timer);
}

function broadcastPtyExit(sessionId: string, exitCode: number) {
  flushPtyDataBroadcast(sessionId);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("pty-exit", { sessionId, exitCode });
    }
  }
}

function ptyMetaPayload(sessionId: string) {
  const meta = PTY_META.get(sessionId);
  if (!meta) return null;
  return {
    sessionId,
    alive: PTY_SESSIONS.has(sessionId),
    pid: meta.pid,
    shell: meta.shell,
    cols: meta.cols,
    rows: meta.rows,
    exitCode: meta.exitCode,
  };
}

function broadcastPtyMeta(sessionId: string) {
  const payload = ptyMetaPayload(sessionId);
  if (!payload) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("pty-meta", payload);
    }
  }
}

function resolvePtyWorkDir(cwd?: string): { ok: true; dir: string } | { ok: false; error: string } {
  const trimmed = cwd?.trim();
  if (!trimmed) return { ok: true, dir: homedir() };
  const dir = normalize(trimmed);
  if (existsSync(dir)) return { ok: true, dir };
  return { ok: false, error: `Directory not found: ${trimmed}` };
}

ipcMain.handle("clipboard-read-text", () => clipboard.readText());

// Windows converts LF to CRLF on the clipboard; normalize before verifying.
function clipboardTextMatches(expected: string): boolean {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  return normalize(clipboard.readText()) === normalize(expected);
}

// On Windows, clipboard.writeText fails silently while another process holds
// the clipboard open (clipboard history managers, RDP, Office). Verify the
// write landed and retry with backoff; report failure so the renderer can
// fall back instead of assuming the copy succeeded.
ipcMain.handle("clipboard-write-text", async (_event, text: string) => {
  const value = text ?? "";
  // Clipboard History / RDP / Office often hold the lock longer than a short
  // burst of retries; give Windows more chances before the renderer falls back.
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    clipboard.writeText(value);
    if (clipboardTextMatches(value)) return true;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
    }
  }
  return false;
});

ipcMain.handle("pick-folder", async (event, defaultPath?: string) => {
  const trimmed = defaultPath?.trim();
  const resolvedDefault =
    trimmed && existsSync(normalize(trimmed)) ? normalize(trimmed) : undefined;
  const options: Electron.OpenDialogOptions = {
    properties: ["openDirectory"],
    ...(resolvedDefault ? { defaultPath: resolvedDefault } : {}),
  };
  const parent = BrowserWindow.fromWebContents(event.sender);
  if (parent && !parent.isDestroyed()) {
    if (parent.isMinimized()) parent.restore();
    parent.focus();
  }
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return canceled ? null : filePaths[0];
});

ipcMain.handle(
  "pty-spawn",
  async (_event, tool: string, cwd?: string, extraArgs?: string, shell?: string) => {
    let pty: PtyModule;
    try {
      pty = await getPty();
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
    const shellOnly = tool === PLAIN_SHELL_TOOL_ID;
    const cmd: string = shellOnly ? "" : (resolveToolLaunchCommand(tool, extraArgs) ?? "");
    if (!shellOnly && !cmd) return { success: false, error: `Unknown tool: ${tool}` };

    const sessionId = `${tool}-${Date.now()}`;
    const workDirResult = resolvePtyWorkDir(cwd);
    if (!workDirResult.ok) {
      return { success: false, error: workDirResult.error };
    }
    const workDir = workDirResult.dir;

    // OSC 7 hooks so `cd` updates the status bar without respawning the PTY.
    // If script install fails, still spawn — cwd just won't track until restart succeeds.
    let shellIntegration: { pwshCommand?: string; bashInitFile?: string } | undefined;
    try {
      const integration = ensureShellIntegrationScripts(app.getPath("userData"));
      shellIntegration = {
        pwshCommand: `. ${psSingleQuote(integration.pwsh)}`,
        bashInitFile: integration.bash,
      };
    } catch (err) {
      console.warn("[pty-spawn] shell integration unavailable:", err);
    }

    const plan = resolvePtySpawnPlan({ command: cmd, shell, shellIntegration });

    const ptyOpts = {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: workDir,
      env: plan.env,
    };

    try {
      let proc: import("node-pty").IPty | undefined;
      let shellPath = "";
      const candidates =
        plan.platform === "win32" ? plan.windowsCandidates : plan.unixCandidates;
      for (const [sh, args] of candidates) {
        try {
          proc = pty.spawn(sh, args, ptyOpts);
          shellPath = sh;
          break;
        } catch {
          /* try next */
        }
      }
      if (!proc) {
        throw new Error(
          plan.platform === "win32"
            ? NO_SUITABLE_WINDOWS_SHELL_ERROR
            : NO_SUITABLE_UNIX_SHELL_ERROR,
        );
      }

      PTY_OUTPUT_BUFFERS.set(sessionId, "");
      PTY_SESSIONS.set(sessionId, proc);
      PTY_META.set(sessionId, {
        pid: typeof proc.pid === "number" ? proc.pid : null,
        shell: basename(shellPath) || shellPath,
        cols: ptyOpts.cols,
        rows: ptyOpts.rows,
        exitCode: null,
      });

      proc.onData((data) => {
        broadcastPtyData(sessionId, data);
      });

      // Kick the shell to emit a prompt after attach (some shells wait for first resize).
      try {
        proc.resize(ptyOpts.cols, ptyOpts.rows);
      } catch {
        /* ignore */
      }

      proc.onExit(({ exitCode }) => {
        PTY_SESSIONS.delete(sessionId);
        clearPtyBuffer(sessionId);
        const meta = PTY_META.get(sessionId);
        if (meta) meta.exitCode = exitCode;
        broadcastPtyExit(sessionId, exitCode);
        broadcastPtyMeta(sessionId);
      });

      broadcastPtyMeta(sessionId);
      return { success: true, sessionId, cwd: workDir };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle(
  "pty-attach",
  (_event, sessionId: string, opts?: { includeBuffer?: boolean }) => {
    const alive = PTY_SESSIONS.has(sessionId);
    const meta = PTY_META.get(sessionId);
    const includeBuffer = opts?.includeBuffer !== false;
    return {
      success: true,
      alive,
      buffer: includeBuffer ? (PTY_OUTPUT_BUFFERS.get(sessionId) ?? "") : "",
      pid: meta?.pid ?? null,
      shell: meta?.shell ?? null,
      cols: meta?.cols ?? null,
      rows: meta?.rows ?? null,
      exitCode: meta?.exitCode ?? null,
    };
  },
);

ipcMain.handle("pty-get-output-buffer", (_event, sessionId: string) => ({
  buffer: PTY_OUTPUT_BUFFERS.get(sessionId) ?? "",
}));

function sanitizeExportBasename(raw: string): string {
  const trimmed = raw.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return (trimmed || "terminal").slice(0, 80);
}

ipcMain.handle(
  "pty-export-output",
  async (_event, sessionId: string, defaultName?: string) => {
    try {
      const buffer = PTY_OUTPUT_BUFFERS.get(sessionId) ?? "";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const base = sanitizeExportBasename(defaultName ?? sessionId);
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Export terminal output",
        defaultPath: `${base}-${stamp}.log`,
        filters: [
          { name: "Log file", extensions: ["log"] },
          { name: "Text file", extensions: ["txt"] },
        ],
      });
      if (canceled || !filePath) return { success: false, canceled: true as const };
      writeFileSync(filePath, buffer, "utf8");
      return { success: true, path: filePath };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle(
  "pty-search-output",
  (
    _event,
    sessionId: string,
    query: string,
    opts?: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxMatches?: number;
      contextChars?: number;
    },
  ) => {
    const buffer = PTY_OUTPUT_BUFFERS.get(sessionId) ?? "";
    return searchPtyOutput(buffer, query ?? "", opts ?? {});
  },
);

ipcMain.handle("pty-get-log-path", async (_event, sessionId: string) => {
  await flushPtyLogNow(sessionId);
  return { path: join(ptyLogDir(), `${sessionId}.log`) };
});

/** Dead session write/resize must not silently no-op — re-emit exit so the UI can stop accepting input. */
function notifyPtySessionGone(sessionId: string): void {
  const meta = PTY_META.get(sessionId);
  if (meta && meta.exitCode == null) meta.exitCode = -1;
  broadcastPtyExit(sessionId, -1);
  broadcastPtyMeta(sessionId);
}

function ptySessionGoneResult(sessionId: string): { success: false; error: string } {
  notifyPtySessionGone(sessionId);
  return { success: false, error: "PTY session is not alive" };
}

function markPtySessionDead(sessionId: string, exitCode: number) {
  PTY_SESSIONS.delete(sessionId);
  clearPtyBuffer(sessionId);
  const meta = PTY_META.get(sessionId);
  if (meta && meta.exitCode == null) meta.exitCode = exitCode;
  broadcastPtyExit(sessionId, exitCode);
  broadcastPtyMeta(sessionId);
}

ipcMain.on("pty-write", (_e, sessionId: string, data: string) => {
  const proc = PTY_SESSIONS.get(sessionId);
  if (!proc) {
    notifyPtySessionGone(sessionId);
    return;
  }
  try {
    proc.write(data);
  } catch {
    markPtySessionDead(sessionId, -1);
  }
});

ipcMain.handle("pty-resize", (_e, sessionId: string, cols: number, rows: number) => {
  const proc = PTY_SESSIONS.get(sessionId);
  if (!proc) return ptySessionGoneResult(sessionId);
  try {
    proc.resize(cols, rows);
    const meta = PTY_META.get(sessionId);
    if (meta) {
      meta.cols = cols;
      meta.rows = rows;
      broadcastPtyMeta(sessionId);
    }
    return { success: true as const };
  } catch (err: unknown) {
    markPtySessionDead(sessionId, -1);
    return { success: false as const, error: (err as Error).message || "PTY resize failed" };
  }
});

ipcMain.on("pty-kill", (_e, sessionId: string) => {
  try {
    PTY_SESSIONS.get(sessionId)?.kill();
  } catch {
    /* already dead */
  }
  PTY_SESSIONS.delete(sessionId);
  clearPtyBuffer(sessionId);
  // Keep PTY_META so the status bar can still show shell / last size / exit.
  // Broadcast immediately so UI leaves "live" before onExit arrives with exitCode.
  broadcastPtyMeta(sessionId);
});

// --- Launch in Terminal ---

ipcMain.handle(
  "launch-in-terminal",
  (_event, tool: string, terminal: string = "auto", cwd?: string, extraArgs?: string) => {
  const cmd = resolveToolLaunchCommand(tool, extraArgs);
  if (!cmd) return { success: false, error: `Unknown tool: ${tool}` };

  const isWin = process.platform === "win32";
  const cdPrefix = cwd
    ? isWin
      ? `cd /d "${cwd}" && `
      : `cd "${cwd}" && `
    : "";
  const pwshCdPrefix = cwd ? `Set-Location '${cwd}'; ` : "";

  try {
    const plat = process.platform;
    if (plat === "win32") {
      const hasWt = (() => {
        try {
          execSync("where.exe wt", { stdio: "ignore" });
          return true;
        } catch {
          return false;
        }
      })();
      if (terminal === "wt" || terminal === "auto") {
        if (hasWt) {
          const wtArgs = cwd
            ? ["new-tab", "--startingDirectory", cwd, "--", "pwsh.exe", "-NoExit", "-Command", cmd]
            : ["new-tab", "--", "pwsh.exe", "-NoExit", "-Command", cmd];
          spawn("wt", wtArgs, { detached: true, stdio: "ignore" }).unref();
          return { success: true };
        }
        if (terminal === "wt") return { success: false, error: "Windows Terminal (wt) not found in PATH" };
        // auto: fall through to pwsh/cmd
      }
      if (terminal === "pwsh") {
        spawn("cmd", ["/c", "start", "pwsh.exe", "-NoExit", "-Command", `${pwshCdPrefix}${cmd}`], { detached: true, stdio: "ignore" }).unref();
      } else if (terminal === "powershell") {
        spawn("cmd", ["/c", "start", "powershell.exe", "-NoExit", "-Command", `${pwshCdPrefix}${cmd}`], { detached: true, stdio: "ignore" }).unref();
      } else {
        // auto fallback (wt failed) or cmd: try pwsh first, then cmd.exe
        try {
          spawn("cmd", ["/c", "start", "pwsh.exe", "-NoExit", "-Command", `${pwshCdPrefix}${cmd}`], { detached: true, stdio: "ignore" }).unref();
        } catch {
          spawn("cmd", ["/c", "start", "cmd", "/k", `${cdPrefix}${cmd}`], { detached: true, stdio: "ignore" }).unref();
        }
      }
    } else if (plat === "darwin") {
      const script = cwd
        ? `cd "${cwd}" && ${cmd}`
        : cmd;
      spawn("osascript", ["-e", `tell application "Terminal" to do script "${script}"`], {
        detached: true, stdio: "ignore",
      }).unref();
    } else {
      const bashCmd = `${cdPrefix}${cmd}`;
      const linuxTerms = [
        ["gnome-terminal", "--", "bash", "-c", `${bashCmd}; exec bash`],
        ["xfce4-terminal", "-e", `bash -c '${bashCmd}; exec bash'`],
        ["konsole", "-e", `bash -c '${bashCmd}; exec bash'`],
        ["xterm", "-e", `bash -c '${bashCmd}; exec bash'`],
      ];
      for (const [bin, ...args] of linuxTerms) {
        try {
          spawn(bin, args, { detached: true, stdio: "ignore" }).unref();
          break;
        } catch { /* try next */ }
      }
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("set-default-model", async (_event, tool: string, model: string) => {
  try {
    let settingsPath: string;
    let key: string;

    if (tool === "claude") {
      settingsPath = join(homedir(), ".claude", "settings.json");
      mkdirSync(join(homedir(), ".claude"), { recursive: true });
      key = "model";
    } else if (tool === "copilot") {
      const copilotHome = process.env["COPILOT_HOME"] ?? join(homedir(), ".copilot");
      mkdirSync(copilotHome, { recursive: true });
      settingsPath = join(copilotHome, "settings.json");
      key = "model";
    } else if (tool === "cursor" || tool === "cursor-agent" || tool === "agent") {
      const appData = process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming");
      settingsPath = join(appData, "Cursor", "User", "settings.json");
      key = "cursor.preferredModel";
    } else if (tool === "gemini") {
      settingsPath = join(homedir(), ".gemini", "settings.json");
      mkdirSync(join(homedir(), ".gemini"), { recursive: true });
      key = "model";
    } else if (tool === "codex") {
      settingsPath = join(homedir(), ".codex", "config.toml");
      key = "model";
    } else if (tool === "opencode") {
      settingsPath = join(homedir(), ".config", "opencode", "opencode.json");
      mkdirSync(join(homedir(), ".config", "opencode"), { recursive: true });
      key = "model";
    } else {
      return { success: false, error: `Unknown tool: ${tool}` };
    }

    console.log(`[set-default-model] tool=${tool} key=${key} model=${model} path=${settingsPath}`);

    const { readFileSync, existsSync } = await import("node:fs");

    if (tool === "codex") {
      if (existsSync(settingsPath)) backupFile(settingsPath);
      setCodexModel(settingsPath, model);
      const verifyText = existsSync(settingsPath) ? readFileSync(settingsPath, "utf-8") : "";
      const match = verifyText.match(/^model\s*=\s*["']?([^"'\n]+)["']?/m);
      if (match?.[1]?.trim() !== model) {
        return { success: false, error: `Write verification failed: expected "${model}", got "${match?.[1] ?? ""}"` };
      }
      console.log(`[set-default-model] success: model=${model}`);
      return { success: true };
    }

    // Read existing settings; abort if file exists but can't be parsed (avoid data loss)
    let data: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, "utf-8");
      data = JSON.parse(raw) as Record<string, unknown>;
    }

    data[key] = model;
    writeJson(settingsPath, data);

    // Verify the write succeeded
    const verify = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    if (verify[key] !== model) {
      return { success: false, error: `Write verification failed: expected "${model}", got "${String(verify[key])}"` };
    }

    console.log(`[set-default-model] success: ${key}=${model}`);
    return { success: true };
  } catch (err: unknown) {
    console.error("[set-default-model] error:", err);
    return { success: false, error: (err as Error).message };
  }
});

// --- Workspace Manager ---

ipcMain.handle("ws-get-tree", () => getWorkspaceTree());

ipcMain.handle("ws-workspace-create", (_e, name: string, rootPath?: string) => {
  try {
    const ws = getWorkspaceContext().workspaceService.create(name, rootPath);
    return { success: true, workspace: ws };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("ws-group-create", (_e, workspace: string, group: string) => {
  try {
    const g = getWorkspaceContext().groupService.create(workspace, group);
    return { success: true, group: g };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle(
  "ws-session-create",
  async (
    _e,
    workspace: string,
    group: string,
    name: string,
    opts?: { cwd?: string; tool?: string },
  ) => {
    try {
      const s = await getWorkspaceContext().sessionService.create(workspace, group, name, opts);
      return { success: true, session: s };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("ws-session-stop", (_e, workspace: string, group: string, name: string) => {
  try {
    const s = getWorkspaceContext().sessionService.stop(workspace, group, name);
    return { success: true, session: s };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("ws-group-layout-get", (_e, workspaceId: string, groupId: string) => {
  try {
    const snapshot = getGroupLayout(workspaceId, groupId);
    return { success: true, snapshot };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle(
  "ws-group-layout-save",
  (
    _e,
    workspaceId: string,
    groupId: string,
    snapshot: GroupLayoutSnapshot,
  ) => {
    try {
      const saved = saveGroupLayout(workspaceId, groupId, snapshot);
      return { success: true, snapshot: saved };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("ws-group-layout-set-active", (_e, workspaceId: string, groupId: string) => {
  try {
    setLastActiveGroup(workspaceId, groupId);
    refreshTrayMenu();
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("profile-get-tree", () => {
  try {
    return { success: true, tree: getProfileTree() };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("profile-group-get-forest", () => {
  try {
    return { success: true, forest: getProfileForest() };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("get-onboarding-completed", () => {
  try {
    return { success: true, completed: getOnboardingCompleted() };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message, completed: false };
  }
});

ipcMain.handle("set-onboarding-completed", () => {
  try {
    setOnboardingCompleted();
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("profile-group-create", (_e, name: string) => {
  try {
    const group = createProfileGroup(name);
    refreshTrayMenu();
    return { success: true, group };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("profile-group-update", (_e, idOrName: string, newName: string) => {
  try {
    const group = updateProfileGroup(idOrName, newName);
    refreshTrayMenu();
    return { success: true, group };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("profile-group-delete", (_e, idOrName: string) => {
  try {
    deleteProfileGroup(idOrName);
    refreshTrayMenu();
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("profile-group-reorder", (_e, orderedGroupIds: string[]) => {
  try {
    const groups = reorderProfileGroups(orderedGroupIds);
    refreshTrayMenu();
    return { success: true, groups };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle(
  "profile-create",
  (
    _e,
    name: string,
    input?: {
      groupId?: string;
      groupName?: string;
      defaultCwd?: string;
      defaultTool?: string;
      accentColor?: string | null;
      broadcastInput?: boolean;
      copyFromProfileId?: string;
    },
  ) => {
    try {
      const profile = createProfile(name, input);
      refreshTrayMenu();
      return { success: true, profile };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("profile-update", (
    _e,
    profileId: string,
    patch: {
      name?: string;
      defaultCwd?: string;
      defaultTool?: string;
      broadcastInput?: boolean;
      accentColor?: string | null;
      savedCommands?: { id: string; name: string; command: string; broadcast?: boolean }[];
    },
  ) => {
    try {
      const profile = updateProfile(profileId, patch);
      refreshTrayMenu();
      return { success: true, profile };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle(
  "profile-set-saved-commands",
  (
    _e,
    profileId: string,
    savedCommands: { id: string; name: string; command: string; broadcast?: boolean }[],
  ) => {
    try {
      const profile = setProfileSavedCommands(profileId, savedCommands);
      refreshTrayMenu();
      return { success: true, profile };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("profile-delete", (_e, profileId: string) => {
  try {
    deleteProfile(profileId);
    refreshTrayMenu();
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle(
  "profile-reorder",
  (_e, groupIdOrName: string, orderedProfileIds: string[]) => {
    try {
      const forest = reorderProfiles(groupIdOrName, orderedProfileIds);
      refreshTrayMenu();
      return { success: true, forest };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("export-backup", async (_event, localStorage: Record<string, string>) => {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export AI Shelf backup",
      defaultPath: `ai-shelf-backup-${stamp}.aishelf`,
      filters: [
        { name: "AI Shelf Backup (ZIP)", extensions: ["aishelf", "zip"] },
        { name: "JSON Backup", extensions: ["json"] },
      ],
    });
    if (canceled || !filePath) return { success: false, canceled: true as const };

    const appVersion = app.getVersion();
    if (filePath.toLowerCase().endsWith(".json")) {
      const payload = createJsonBackup(appVersion, localStorage);
      writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
    } else {
      const zipBytes = createZipBackup(appVersion, localStorage);
      writeFileSync(filePath, Buffer.from(zipBytes));
    }
    return { success: true, path: filePath };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("import-backup", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Import AI Shelf backup",
      properties: ["openFile"],
      filters: [{ name: "AI Shelf Backup", extensions: ["aishelf", "zip", "json"] }],
    });
    if (canceled || !filePaths[0]) return { success: false, canceled: true as const };

    const manifest = applyBackup(readFileSync(filePaths[0]));
    return {
      success: true,
      localStorage: manifest.localStorage,
      exportedAt: manifest.exportedAt,
      appVersion: manifest.appVersion,
    };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

// --- Config snapshots (MCP / .claude.json / skills) ---

async function inventoryForSnapshot(): Promise<ProviderEntry[]> {
  const cached = getCachedInventory();
  if (cached) return cached;
  const entries = await detectAll({ quick: true });
  setInventoryCache(entries);
  return entries;
}

ipcMain.handle("config-snapshot-list", () => {
  try {
    return { success: true, snapshots: listConfigSnapshots() };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message, snapshots: [] };
  }
});

ipcMain.handle("config-snapshot-create", async (_event, label: string) => {
  try {
    const entries = await inventoryForSnapshot();
    const manifest = createConfigSnapshot(entries, label ?? "", app.getVersion());
    return { success: true, snapshot: manifest };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("config-snapshot-restore", (_event, id: string) => {
  try {
    const manifest = restoreConfigSnapshot(id);
    return { success: true, snapshot: manifest };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("config-snapshot-delete", (_event, id: string) => {
  try {
    deleteConfigSnapshot(id);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("config-snapshot-diff", (_event, idA: string, idB: string) => {
  try {
    const diff = diffConfigSnapshots(idA, idB);
    return { success: true, diff };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("config-snapshot-export", async (_event, id: string) => {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export config snapshot",
      defaultPath: `ai-shelf-config-${stamp}.${CONFIG_SNAPSHOT_BUNDLE_EXT}`,
      filters: [
        { name: "AI Shelf Config Snapshot", extensions: [CONFIG_SNAPSHOT_BUNDLE_EXT, "zip"] },
      ],
    });
    if (canceled || !filePath) return { success: false, canceled: true as const };

    writeFileSync(filePath, exportConfigSnapshotBundle(id));
    return { success: true, path: filePath };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("config-snapshot-import", async (_event, label?: string) => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Import config snapshot",
      properties: ["openFile"],
      filters: [
        {
          name: "AI Shelf Config Snapshot",
          extensions: [CONFIG_SNAPSHOT_BUNDLE_EXT, "zip"],
        },
      ],
    });
    if (canceled || !filePaths[0]) return { success: false, canceled: true as const };

    const manifest = importConfigSnapshotBundle(
      readFileSync(filePaths[0]),
      label ?? "",
      app.getVersion(),
    );
    return { success: true, snapshot: manifest };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("relaunch-app", () => {
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

ipcMain.handle("set-system-tray-enabled", (_event, enabled: unknown) => {
  const on = enabled === true;
  writeSystemTrayEnabledToDisk(on);
  applySystemTrayEnabled(on, getTrayDeps());
  return { ok: true, systemTrayEnabled: on };
});

ipcMain.handle("get-system-tray-enabled", () => ({
  systemTrayEnabled: isSystemTrayEnabled(),
}));

ipcMain.handle("set-pty-buffer-max-chars", (_event, chars: unknown) => {
  setPtyBufferMaxChars(clampPtyBufferMaxChars(chars));
  return { ok: true, terminalPtyBufferChars: ptyBufferMaxChars };
});

ipcMain.handle("get-pty-buffer-max-chars", () => ({
  terminalPtyBufferChars: ptyBufferMaxChars,
}));

ipcMain.handle(
  "show-pane-agent-notification",
  (_event, payload: { title?: string; body?: string; paneId?: string; silent?: boolean }) => {
    const title = typeof payload?.title === "string" ? payload.title : "AI Shelf";
    const body = typeof payload?.body === "string" ? payload.body : "";
    return showPaneAgentNotification(
      { title, body, paneId: payload?.paneId, silent: payload?.silent },
      getTrayDeps(),
    );
  },
);

ipcMain.handle("set-tray-pane-attention", (_event, count: unknown) => {
  const n = typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  syncTrayPaneAttention(n, getTrayDeps());
  return { ok: true, count: n };
});

ipcMain.handle("flow-list", () => listFlows());
ipcMain.handle("flow-list-active-runs", () => listActiveFlowRuns());
ipcMain.handle("flow-read-run-output", (_event, runId: unknown) => {
  if (typeof runId !== "string" || !runId.trim()) {
    return { ok: false, error: "Invalid run id" };
  }
  return readRunOutput(runId.trim());
});
ipcMain.handle("flow-get-latest-run-output", (_event, flowId: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return null;
  }
  return getLatestRunWithOutput(flowId.trim());
});
ipcMain.handle("flow-read-file", (_event, flowId: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) return null;
  return readFlowFile(flowId.trim());
});

ipcMain.handle("flow-get-dag-node-command", (_event, flowId: unknown, node: unknown, options: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { error: "Invalid flow id" };
  }
  if (!node || typeof node !== "object") {
    return { error: "Invalid node" };
  }
  const n = node as {
    kind?: unknown;
    phaseId?: unknown;
    phaseLabel?: unknown;
    phaseMessage?: unknown;
  };
  if (n.kind !== "trigger" && n.kind !== "phase" && n.kind !== "output") {
    return { error: "Invalid node kind" };
  }
  let runOptions: {
    globalToolLaunchArgs?: import("../tool-launch.js").ToolLaunchArgs;
    runId?: string;
    outputPath?: string | null;
  } = {};
  if (options && typeof options === "object") {
    const o = options as {
      globalToolLaunchArgs?: unknown;
      runId?: unknown;
      outputPath?: unknown;
    };
    if (o.globalToolLaunchArgs && typeof o.globalToolLaunchArgs === "object") {
      runOptions.globalToolLaunchArgs = o.globalToolLaunchArgs as import("../tool-launch.js").ToolLaunchArgs;
    }
    if (typeof o.runId === "string" && o.runId.trim()) {
      runOptions.runId = o.runId.trim();
    }
    if (typeof o.outputPath === "string") {
      runOptions.outputPath = o.outputPath;
    } else if (o.outputPath === null) {
      runOptions.outputPath = null;
    }
  }
  return getFlowDagNodeCommand(
    flowId.trim(),
    {
      kind: n.kind,
      phaseId: typeof n.phaseId === "string" ? n.phaseId : undefined,
      phaseLabel: typeof n.phaseLabel === "string" ? n.phaseLabel : undefined,
      phaseMessage:
        typeof n.phaseMessage === "string" || n.phaseMessage === null ? n.phaseMessage : undefined,
    },
    runOptions,
  );
});

ipcMain.handle("flow-run", (_event, flowId: unknown, options: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { ok: false, error: "Invalid flow id" };
  }
  let runOptions: import("../flow/core.js").RunFlowOptions = {};
  if (options && typeof options === "object") {
    const o = options as { globalToolLaunchArgs?: unknown };
    if (o.globalToolLaunchArgs && typeof o.globalToolLaunchArgs === "object") {
      runOptions = {
        globalToolLaunchArgs: o.globalToolLaunchArgs as import("../tool-launch.js").ToolLaunchArgs,
      };
    }
  }
  return runFlow(flowId.trim(), runOptions);
});
ipcMain.handle("flow-cancel-run", (_event, flowId: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { ok: false, error: "Invalid flow id" };
  }
  return cancelFlowRun(flowId.trim());
});
ipcMain.handle("flow-approve-gate", (_event, flowId: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { ok: false, error: "Invalid flow id" };
  }
  return approveFlowGate(flowId.trim());
});
ipcMain.handle("flow-reject-gate", (_event, flowId: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { ok: false, error: "Invalid flow id" };
  }
  return rejectFlowGate(flowId.trim());
});
ipcMain.handle("flow-get-task-scheduler-status", () => getFlowTaskSchedulerStatus());
ipcMain.handle("flow-install-task-scheduler", () => installFlowTaskScheduler());
ipcMain.handle("flow-remove-task-scheduler", () => removeFlowTaskScheduler());
ipcMain.handle("flow-get-run-state", (_event, runId: unknown) => {
  if (typeof runId !== "string" || !runId.trim()) return null;
  return getFlowRunState(runId.trim());
});
ipcMain.handle("flow-list-recent-runs", (_event, limit: unknown) => {
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.round(limit)) : 20;
  return listRecentRuns(n);
});

ipcMain.handle("flow-list-runs-for-flow", (_event, flowId: unknown, limit: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) return [];
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.round(limit)) : 30;
  return listRunsForFlow(flowId.trim(), n);
});

ipcMain.handle("flow-get-console-buffer", (_event, runId: unknown) => {
  if (typeof runId !== "string" || !runId.trim()) {
    return { runId: "", text: "", truncated: false, phaseId: null, alive: false, lastSeq: 0 };
  }
  return getFlowConsoleBuffer(runId.trim());
});
ipcMain.handle("flow-get-run-events", (_event, runId: unknown) => {
  if (typeof runId !== "string" || !runId.trim()) return [];
  return getRunEvents(runId.trim());
});

ipcMain.handle("flow-open-run-artifact", (_event, runId: unknown, artifact: unknown) => {
  if (typeof runId !== "string" || !runId.trim()) {
    return { ok: false, error: "Invalid run id" };
  }
  const kind =
    artifact === "prompt" || artifact === "events" || artifact === "output" || artifact === "runDir"
      ? artifact
      : null;
  if (!kind) return { ok: false, error: "Invalid artifact" };
  const path = getRunArtifactPath(runId.trim(), kind);
  if (!path) return { ok: false, error: "File not found" };
  void shell.openPath(path);
  return { ok: true, path };
});

ipcMain.handle("flow-open-flows-dir", () => {
  void shell.openPath(getFlowsDir());
});

ipcMain.handle("flow-delete", (_event, flowId: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { ok: false, error: "Invalid flow id" };
  }
  return deleteFlow(flowId.trim());
});

ipcMain.handle("flow-open-file", (_event, flowId: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) return { ok: false };
  const filePath = getFlowFilePath(flowId.trim());
  if (!filePath) return { ok: false, error: "Flow not found" };
  void shell.openPath(filePath);
  return { ok: true, path: filePath };
});

ipcMain.handle("flow-get-schedule-prefs", () => readFlowSchedulePrefs());

ipcMain.handle("flow-set-schedule-prefs", (_event, partial: unknown) => {
  if (!partial || typeof partial !== "object") {
    return { ok: false, error: "Invalid prefs" };
  }
  const p = partial as { schedulerEnabled?: unknown };
  const next = writeFlowSchedulePrefs({
    schedulerEnabled:
      typeof p.schedulerEnabled === "boolean" ? p.schedulerEnabled : undefined,
  });
  return { ok: true, prefs: next };
});

ipcMain.handle("flow-save-schedule", (_event, flowId: unknown, patch: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { ok: false, error: "Invalid flow id" };
  }
  if (!patch || typeof patch !== "object") {
    return { ok: false, error: "Invalid schedule patch" };
  }
  const p = patch as { schedule?: unknown; timezone?: unknown };
  const schedule =
    p.schedule === null
      ? null
      : typeof p.schedule === "string"
        ? p.schedule
        : undefined;
  if (schedule === undefined) {
    return { ok: false, error: "schedule is required (string or null)" };
  }
  const timezone =
    p.timezone === null || p.timezone === undefined
      ? p.timezone === null
        ? null
        : undefined
      : typeof p.timezone === "string"
        ? p.timezone
        : undefined;
  return saveFlowSchedule(flowId.trim(), { schedule, timezone });
});

ipcMain.handle("flow-save-runner-settings", (_event, flowId: unknown, patch: unknown) => {
  if (typeof flowId !== "string" || !flowId.trim()) {
    return { ok: false, error: "Invalid flow id" };
  }
  if (!patch || typeof patch !== "object") {
    return { ok: false, error: "Invalid runner patch" };
  }
  const p = patch as {
    tool?: unknown;
    toolArgs?: unknown;
    cwd?: unknown;
    profile?: unknown;
  };
  if (typeof p.tool !== "string" || !p.tool.trim()) {
    return { ok: false, error: "tool is required" };
  }
  const nullableString = (v: unknown): string | null | undefined => {
    if (v === null) return null;
    if (typeof v === "string") return v;
    return undefined;
  };
  const toolArgs = nullableString(p.toolArgs);
  const cwd = nullableString(p.cwd);
  const profile = nullableString(p.profile);
  if (toolArgs === undefined || cwd === undefined || profile === undefined) {
    return { ok: false, error: "Invalid runner patch fields" };
  }
  return saveFlowRunner(flowId.trim(), {
    tool: p.tool.trim(),
    toolArgs,
    cwd,
    profile,
  });
});

ipcMain.handle("flow-run-due", async () => {
  // wait:false so a long-running flow doesn't hold the renderer invoke open;
  // run progress is delivered through flow run-state events.
  const result = await runDueFlows(new Date(), { wait: false });
  return { ok: true, result };
});

ipcMain.handle("flow-generate", async (_event, payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid request" };
  }
  const { turns, flowId } = payload as { turns?: unknown; flowId?: unknown };
  if (!Array.isArray(turns)) {
    return { ok: false, error: "Invalid conversation" };
  }
  const parsed = turns
    .filter((t): t is { role: "user" | "assistant"; content: string } => {
      if (!t || typeof t !== "object") return false;
      const role = (t as { role?: unknown }).role;
      const content = (t as { content?: unknown }).content;
      return (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim().length > 0
      );
    })
    .map((t) => ({ role: t.role, content: t.content.trim() }));
  const logFlowId =
    typeof flowId === "string" && flowId.trim() ? flowId.trim() : FLOW_CHAT_DRAFT_ID;
  return generateFlowFromChat(parsed, { flowId: logFlowId });
});

function normalizeChatFlowId(flowId: unknown): string | null {
  if (typeof flowId !== "string" || !flowId.trim()) return null;
  const id = flowId.trim();
  if (id === FLOW_CHAT_DRAFT_ID) return id;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return null;
  return id;
}

function parseChatMessages(raw: unknown): FlowChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const messages: FlowChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role;
    const content = rec.content;
    const id = rec.id;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    if (typeof id !== "string" || !id.trim()) continue;
    messages.push({
      id: id.trim(),
      role,
      content,
      draft: typeof rec.draft === "string" ? rec.draft : undefined,
      error: rec.error === true,
      createdAt:
        typeof rec.createdAt === "string" && rec.createdAt
          ? rec.createdAt
          : new Date().toISOString(),
    });
  }
  return messages;
}

ipcMain.handle("flow-get-chat", (_event, flowId: unknown) => {
  const id = normalizeChatFlowId(flowId);
  if (!id) return null;
  const state = readFlowChat(id);
  return state?.messages ?? [];
});

ipcMain.handle("flow-save-chat", (_event, flowId: unknown, messages: unknown) => {
  const id = normalizeChatFlowId(flowId);
  if (!id) return { ok: false, error: "Invalid flow id" };
  const parsed = parseChatMessages(messages);
  if (!parsed) return { ok: false, error: "Invalid messages" };
  saveFlowChat(id, parsed);
  return { ok: true };
});

ipcMain.handle("flow-clear-chat", (_event, flowId: unknown) => {
  const id = normalizeChatFlowId(flowId);
  if (!id) return { ok: false, error: "Invalid flow id" };
  deleteFlowChatData(id);
  return { ok: true };
});

ipcMain.handle("flow-list-prompt-logs", (_event, flowId: unknown, limit: unknown) => {
  const id = normalizeChatFlowId(flowId);
  if (!id) return [];
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.round(limit)) : 50;
  return listFlowPromptLogs(id, n);
});

ipcMain.handle("flow-create", (_event, content: unknown, options: unknown) => {
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: "Invalid flow content" };
  }
  // Backward compatible: second arg was `overwrite: boolean`.
  const opts =
    options && typeof options === "object"
      ? (options as { overwrite?: unknown; migrateChatFromDraft?: unknown })
      : { overwrite: options === true };
  return createFlowFromContent(content, {
    overwrite: opts.overwrite === true,
    migrateChatFromDraft: opts.migrateChatFromDraft !== false,
  });
});

ipcMain.handle("flow-list-templates", () => listBundledFlowTemplates());

ipcMain.handle("flow-install-template", (_event, templateId: unknown) => {
  if (typeof templateId !== "string" || !templateId.trim()) {
    return { ok: false, error: "Invalid template id" };
  }
  return installBundledFlowTemplate(templateId.trim());
});

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  await startRendererServer(RENDERER_DIR);

  // Apply close-to-tray preference before bindMinimizeToTray runs inside createWindow.
  // Tray icon uses a minimal menu first; profile forest (SQLite) loads on the next tick.
  const trayEnabled = readSystemTrayEnabledFromDisk();
  setMinimizeToTrayEnabled(trayEnabled);

  setupAppMenu();
  createWindow();

  if (trayEnabled) {
    applySystemTrayEnabled(true, getTrayDeps(), { skipForestMenu: true });
  }
  setImmediate(() => {
    applySystemTrayEnabled(trayEnabled, getTrayDeps());
  });

  initAppUpdater(() => mainWindow);
  scheduleStartupUpdateCheck();
  initHealthMonitor(() => mainWindow);
  initFlowService();
  initFlowScheduler(() => mainWindow);
  onFlowRunState((state) => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    win.webContents.send("flow-run-state", state);
  });
  onFlowConsoleChunk((chunk) => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    win.webContents.send("flow-console-chunk", chunk);
  });
  onAppUpdateCheckSettled(() => onAppUpdateStateChanged());
});

app.on("will-quit", () => {
  stopFlowScheduler();
  stopRendererServer();
});

// Kill all active PTY sessions before the app exits
let profileLayoutFlushDone = false;
let profileLayoutFlushInProgress = false;

function isTerminalRendererWindow(win: BrowserWindow): boolean {
  if (win.webContents.isDestroyed()) return false;
  const url = win.webContents.getURL();
  return !url.includes("#settings");
}

function flushProfileLayoutsFromRenderer(): Promise<void> {
  const wins = BrowserWindow.getAllWindows().filter(isTerminalRendererWindow);
  if (wins.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const pending = new Set(wins.map((w) => w.webContents.id));
    const timeout = setTimeout(() => {
      ipcMain.removeListener("profile-layout-flush-done", onDone);
      resolve();
    }, 3000);

    const onDone = (e: Electron.IpcMainEvent) => {
      pending.delete(e.sender.id);
      if (pending.size === 0) {
        clearTimeout(timeout);
        ipcMain.removeListener("profile-layout-flush-done", onDone);
        resolve();
      }
    };

    ipcMain.on("profile-layout-flush-done", onDone);
    for (const win of wins) {
      if (win.webContents.isDestroyed()) {
        pending.delete(win.webContents.id);
        continue;
      }
      win.webContents.send("profile-layout-flush");
    }
    if (pending.size === 0) {
      clearTimeout(timeout);
      ipcMain.removeListener("profile-layout-flush-done", onDone);
      resolve();
    }
  });
}

function tearDownOnQuit(): void {
  setAppQuitting(true);
  for (const [, proc] of PTY_SESSIONS) {
    try { proc.kill(); } catch { /* already dead */ }
  }
  PTY_SESSIONS.clear();
  closeWorkspaceContext();
}

app.on("before-quit", (e) => {
  if (profileLayoutFlushDone) {
    tearDownOnQuit();
    return;
  }
  if (profileLayoutFlushInProgress) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  profileLayoutFlushInProgress = true;
  void flushProfileLayoutsFromRenderer().finally(() => {
    profileLayoutFlushInProgress = false;
    profileLayoutFlushDone = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (isSystemTrayEnabled()) {
    // Keep running in the tray so PTY sessions stay alive when windows are hidden.
    return;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!gotSingleInstanceLock) return;
  if (mainWindow === null) createWindow();
});

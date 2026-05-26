import { app, BrowserWindow, ipcMain, shell, dialog, Menu, clipboard } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
import { MCP_SYNC_TOOL_IDS, TOOL_LAUNCH_CMD, TOOL_NPM_PACKAGE, TOOL_UPDATE } from "../tools.js";
import { run } from "../utils/exec.js";
import { formatGitBuildLabel, readGitBuildInfo } from "../utils/git-build-info.js";
import { getMcpConfigPath, tryReadJson, backupFile, writeJson } from "../utils/config.js";
import type { GroupLayoutSnapshot } from "ai-shelf";
import { searchPtyOutput } from "../shared/pty-output-search.js";
import {
  checkAppUpdate,
  downloadAppUpdate,
  getAppUpdateState,
  getDesktopSelfLatestVersion,
  initAppUpdater,
  isDesktopAutoUpdateEnabled,
  isDesktopUpdateDownloaded,
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
  getProfileTree,
  createProfile,
  updateProfile,
  deleteProfile,
  reorderProfiles,
} from "./workspace-host.js";
import { applyBackup, createJsonBackup, createZipBackup } from "./backup-service.js";

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

const RENDERER_HTML = join(import.meta.dirname, "..", "renderer", "index.html");
const APP_ICON = join(import.meta.dirname, "..", "assets", "icon.ico");

const sharedWebPreferences = {
  preload: join(import.meta.dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
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

  mainWindow.loadFile(RENDERER_HTML);
  attachWindow(mainWindow, "AI Shelf");

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
  chatWindow.loadFile(RENDERER_HTML, { hash: "chat" });
  attachWindow(chatWindow, "AI Terminal");
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
  settingsWindow.loadFile(RENDERER_HTML, { hash: "settings" });
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
async function runChecksForEntry(entry: Awaited<ReturnType<typeof detectAll>>[number]) {
  const checks: { name: string; status: "pass" | "fail" | "warn"; detail: string }[] = [];

  checks.push({
    name: "binary",
    status: entry.available ? "pass" : "fail",
    detail: entry.available
      ? `${entry.tool} found (${entry.version})`
      : `${entry.tool} not found in PATH`,
  });

  if (entry.available) {
    checks.push({
      name: "auth",
      status: entry.auth === "ok" ? "pass" : entry.auth === "missing" ? "fail" : "warn",
      detail: `auth: ${entry.auth}`,
    });
  }

  for (const p of entry.config.paths) {
    if (p.endsWith(".json")) {
      const ok = tryReadJson(p) !== null;
      checks.push({ name: "config", status: ok ? "pass" : "fail", detail: `${ok ? "valid" : "invalid"} JSON: ${p}` });
    }
  }

  for (const p of entry.mcp.configPaths) {
    const ok = tryReadJson(p) !== null;
    checks.push({ name: "mcp-config", status: ok ? "pass" : "fail", detail: `${ok ? "valid" : "invalid"} MCP config: ${p}` });
  }

  return { tool: entry.tool, checks };
}

ipcMain.handle("run-doctor", async () => {
  const entries = getCachedInventory() ?? await detectAll({ quick: true });
  if (!getCachedInventory()) setInventoryCache(entries);
  return Promise.all(entries.map(runChecksForEntry));
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
  return runChecksForEntry(entry);
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

function fetchLatestNpmVersion(pkg: string): string | null {
  try {
    return execSync(`npm view ${pkg} version`, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
  } catch {
    return null;
  }
}

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
    entries = getCachedInventory() ?? await detectAll({ quick: true });
    if (!getCachedInventory()) setInventoryCache(entries);
  } catch {
    entries = [];
  }

  const installedToolIds = new Set(
    entries.filter((e) => e.available).map((e) => e.tool),
  );
  const latestVersionMap: Record<string, string | null> = {};
  await Promise.all(
    Object.entries(TOOL_NPM_PACKAGE)
      .filter(([tool]) => installedToolIds.has(tool))
      .map(async ([tool, pkg]) => {
        latestVersionMap[tool] = fetchLatestNpmVersion(pkg);
      }),
  );

  for (const entry of entries) {
    const cfg = TOOL_UPDATE_COMMANDS[entry.tool];
    results.push({
      tool: entry.tool,
      label: cfg?.label ?? entry.provider,
      currentVersion: entry.version ?? null,
      latestVersion: entry.available ? (latestVersionMap[entry.tool] ?? null) : null,
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

/** Re-detect one tool's installed version and npm latest (after a single-tool update). */
ipcMain.handle("refresh-tool-update-info", async (_event, tool: string) => {
  if (tool === "ai-shelf") {
    const selfLatest = app.isPackaged ? await resolveDesktopSelfLatestVersion() : null;
    return buildAiShelfSelfEntry(selfLatest);
  }

  const detected = await detectTool(tool, { quick: true });
  if (!detected) return null;

  const cfg = TOOL_UPDATE_COMMANDS[detected.tool] ?? TOOL_UPDATE_COMMANDS[tool];
  const pkg = TOOL_NPM_PACKAGE[detected.tool] ?? TOOL_NPM_PACKAGE[tool];
  const latestVersion = !detected.available
    ? null
    : pkg
      ? fetchLatestNpmVersion(pkg)
      : (detected.version ?? null);

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

  // Now check npm latest (or desktop updater for ai-shelf) — installed tools only
  await Promise.all(allTools.map(async (info) => {
    const { tool, available } = info;
    if (tool !== "ai-shelf" && !available) {
      push("tool-latest", { tool, latestVersion: null });
      return;
    }
    let latestVersion: string | null = null;
    if (tool === "ai-shelf" && app.isPackaged) {
      latestVersion = await resolveDesktopSelfLatestVersion();
    } else {
      const pkg = TOOL_NPM_PACKAGE[tool];
      latestVersion = pkg ? fetchLatestNpmVersion(pkg) : null;
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

type McpServerEntry = Record<string, unknown>;
type McpServersMap = Record<string, McpServerEntry>;

const SYNC_TOOLS = MCP_SYNC_TOOL_IDS;

/** Read MCP servers from a tool's config file */
function readMcpServers(tool: string): McpServersMap {
  const configPath = getMcpConfigPath(tool);
  if (!configPath || !existsSync(configPath)) return {};
  const data = tryReadJson<Record<string, unknown>>(configPath);
  if (!data) return {};
  const servers = data["mcpServers"];
  if (servers && typeof servers === "object") {
    return servers as McpServersMap;
  }
  return {};
}

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
}) => {
  const { serverNames, targetTools } = opts;

  // Collect all servers from all tools as source pool
  const allServers: McpServersMap = {};
  for (const tool of SYNC_TOOLS) {
    const servers = readMcpServers(tool);
    for (const [name, config] of Object.entries(servers)) {
      if (!allServers[name]) {
        allServers[name] = config;
      }
    }
  }

  const results: { tool: string; added: string[]; skipped: string[]; error?: string }[] = [];

  for (const tool of targetTools) {
    const configPath = getMcpConfigPath(tool);
    if (!configPath) {
      results.push({ tool, added: [], skipped: [], error: "Unknown tool" });
      continue;
    }

    try {
      // Read existing config (or create empty)
      let data: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        data = tryReadJson<Record<string, unknown>>(configPath) ?? {};
      }
      const existing = (data["mcpServers"] as McpServersMap) ?? {};

      const added: string[] = [];
      const skipped: string[] = [];

      for (const name of serverNames) {
        if (existing[name]) {
          skipped.push(name);
          continue;
        }
        const source = allServers[name];
        if (!source) continue;

        // Adapt format: strip `type` for Claude/Copilot, add for Cursor
        const adapted = { ...source };
        if (tool === "cursor" && !adapted["type"]) {
          adapted["type"] = "command";
        } else if (tool !== "cursor") {
          delete adapted["type"];
        }

        existing[name] = adapted;
        added.push(name);
      }

      if (added.length > 0) {
        backupFile(configPath);
        data["mcpServers"] = existing;
        writeJson(configPath, data);
      }

      results.push({ tool, added, skipped });
    } catch (err: any) {
      results.push({ tool, added: [], skipped: [], error: err.message });
    }
  }

  return results;
});

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
const PTY_BUFFER_MAX_CHARS = 256 * 1024;

function ptyLogDir(): string {
  return join(app.getPath("userData"), "pty-logs");
}

/** Mirror PTY transcript for external tools / agents (grep, read). */
function mirrorPtyLog(sessionId: string, text: string) {
  try {
    const dir = ptyLogDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.log`), text, "utf8");
  } catch {
    /* best-effort */
  }
}

function appendPtyBuffer(sessionId: string, data: string) {
  const prev = PTY_OUTPUT_BUFFERS.get(sessionId) ?? "";
  let next = prev + data;
  if (next.length > PTY_BUFFER_MAX_CHARS) {
    next = next.slice(-PTY_BUFFER_MAX_CHARS);
  }
  PTY_OUTPUT_BUFFERS.set(sessionId, next);
  mirrorPtyLog(sessionId, next);
}

function clearPtyBuffer(sessionId: string) {
  PTY_OUTPUT_BUFFERS.delete(sessionId);
  try {
    const file = join(ptyLogDir(), `${sessionId}.log`);
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* ignore */
  }
}

function broadcastPtyData(sessionId: string, data: string) {
  appendPtyBuffer(sessionId, data);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("pty-data", { sessionId, data });
    }
  }
}

function broadcastPtyExit(sessionId: string, exitCode: number) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("pty-exit", { sessionId, exitCode });
    }
  }
}

function resolvePtyWorkDir(cwd?: string): { ok: true; dir: string } | { ok: false; error: string } {
  const trimmed = cwd?.trim();
  if (!trimmed) return { ok: true, dir: homedir() };
  if (existsSync(trimmed)) return { ok: true, dir: trimmed };
  return { ok: false, error: `Directory not found: ${trimmed}` };
}

ipcMain.handle("clipboard-read-text", () => clipboard.readText());

ipcMain.handle("clipboard-write-text", (_event, text: string) => {
  clipboard.writeText(text ?? "");
});

ipcMain.handle("pick-folder", async (_event, defaultPath?: string) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    ...(defaultPath ? { defaultPath } : {}),
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle("pty-spawn", async (event, tool: string, cwd?: string) => {
  let pty: PtyModule;
  try {
    pty = await getPty();
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
  const shellOnly = tool === PLAIN_SHELL_TOOL_ID;
  const cmd = shellOnly ? "" : TOOL_LAUNCH_CMD[tool];
  if (!shellOnly && !cmd) return { success: false, error: `Unknown tool: ${tool}` };

  const sessionId = `${tool}-${Date.now()}`;
  const isWin = process.platform === "win32";
  const workDirResult = resolvePtyWorkDir(cwd);
  if (!workDirResult.ok) {
    return { success: false, error: workDirResult.error };
  }
  const workDir = workDirResult.dir;

  // On Windows: prefer pwsh (loads $PROFILE for prompt themes) → powershell → cmd
  const windowsCandidates: [string, string[]][] = shellOnly
    ? [
        ["pwsh.exe", ["-NoLogo", "-NoExit"]],
        ["powershell.exe", ["-NoLogo", "-NoExit"]],
        ["cmd.exe", ["/k"]],
      ]
    : [
        ["pwsh.exe", ["-NoLogo", "-NoExit", "-Command", cmd]],
        ["powershell.exe", ["-NoLogo", "-NoExit", "-Command", cmd]],
        ["cmd.exe", ["/k", cmd]],
      ];
  const unixShell = "/bin/bash";
  const unixArgs = shellOnly ? [] : ["-c", `${cmd}; exec bash`];

  const ptyOpts = {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: workDir,
    // COLORTERM=truecolor enables 24-bit color; TERM is set by node-pty via `name`
    // TERM_PROGRAM tells Oh My Posh / Starship this is a recognised terminal (enables icons/glyphs)
    // WT_SESSION mimics Windows Terminal so pwsh prompt themes activate fully
    env: {
      ...process.env,
      COLORTERM: "truecolor",
      TERM_PROGRAM: "vscode",
      WT_SESSION: process.env.WT_SESSION ?? "electron-pty",
    } as Record<string, string>,
  };

  try {
    let proc: import("node-pty").IPty | undefined;

    if (isWin) {
      for (const [sh, args] of windowsCandidates) {
        try { proc = pty.spawn(sh, args, ptyOpts); break; }
        catch { /* try next */ }
      }
      if (!proc) throw new Error("No suitable shell found (pwsh / powershell / cmd)");
    } else {
      proc = pty.spawn(unixShell, unixArgs, ptyOpts);
    }

    PTY_OUTPUT_BUFFERS.set(sessionId, "");

    PTY_SESSIONS.set(sessionId, proc);

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
      broadcastPtyExit(sessionId, exitCode);
    });

    return { success: true, sessionId };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("pty-attach", (_event, sessionId: string) => {
  const alive = PTY_SESSIONS.has(sessionId);
  return {
    success: true,
    alive,
    buffer: PTY_OUTPUT_BUFFERS.get(sessionId) ?? "",
  };
});

ipcMain.handle("pty-get-output-buffer", (_event, sessionId: string) => ({
  buffer: PTY_OUTPUT_BUFFERS.get(sessionId) ?? "",
}));

ipcMain.handle(
  "pty-search-output",
  (
    _event,
    sessionId: string,
    query: string,
    opts?: { caseSensitive?: boolean; maxMatches?: number; contextChars?: number },
  ) => {
    const buffer = PTY_OUTPUT_BUFFERS.get(sessionId) ?? "";
    return searchPtyOutput(buffer, query ?? "", opts ?? {});
  },
);

ipcMain.handle("pty-get-log-path", (_event, sessionId: string) => ({
  path: join(ptyLogDir(), `${sessionId}.log`),
}));

ipcMain.on("pty-write",  (_e, sessionId: string, data: string)                    => { PTY_SESSIONS.get(sessionId)?.write(data); });
ipcMain.on("pty-resize", (_e, sessionId: string, cols: number, rows: number)       => { PTY_SESSIONS.get(sessionId)?.resize(cols, rows); });
ipcMain.on("pty-kill",   (_e, sessionId: string)                                   => {
  try { PTY_SESSIONS.get(sessionId)?.kill(); } catch { /* already dead */ }
  PTY_SESSIONS.delete(sessionId);
  clearPtyBuffer(sessionId);
});

// --- Launch in Terminal ---

ipcMain.handle("launch-in-terminal", (_event, tool: string, terminal: string = "auto", cwd?: string) => {
  const baseCmd = TOOL_LAUNCH_CMD[tool];
  if (!baseCmd) return { success: false, error: `Unknown tool: ${tool}` };

  // Prepend cd to working directory if specified
  const isWin = process.platform === "win32";
  const cdPrefix = cwd
    ? isWin
      ? `cd /d "${cwd}" && `
      : `cd "${cwd}" && `
    : "";
  const pwshCdPrefix = cwd ? `Set-Location '${cwd}'; ` : "";
  const cmd = baseCmd;

  try {
    const plat = process.platform;
    if (plat === "win32") {
      if (terminal === "wt" || terminal === "auto") {
        try {
          const wtArgs = cwd
            ? ["new-tab", "--startingDirectory", cwd, "--", "pwsh.exe", "-NoExit", "-Command", cmd]
            : ["new-tab", "--", "pwsh.exe", "-NoExit", "-Command", cmd];
          spawn("wt", wtArgs, { detached: true, stdio: "ignore" }).unref();
          return { success: true };
        } catch {
          if (terminal === "wt") return { success: false, error: "Windows Terminal (wt) not found in PATH" };
          // auto: fall through to pwsh/cmd
        }
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
    } else if (tool === "opencode") {
      settingsPath = join(homedir(), ".config", "opencode", "opencode.json");
      mkdirSync(join(homedir(), ".config", "opencode"), { recursive: true });
      key = "model";
    } else {
      return { success: false, error: `Unknown tool: ${tool}` };
    }

    console.log(`[set-default-model] tool=${tool} key=${key} model=${model} path=${settingsPath}`);

    // Read existing settings; abort if file exists but can't be parsed (avoid data loss)
    const { readFileSync, existsSync } = await import("node:fs");
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

ipcMain.handle(
  "profile-create",
  (
    _e,
    name: string,
    input?: {
      defaultCwd?: string;
      defaultTool?: string;
      accentColor?: string | null;
      broadcastInput?: boolean;
      copyFromProfileId?: string;
    },
  ) => {
    try {
      const profile = createProfile(name, input);
      return { success: true, profile };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle(
  "profile-update",
  (
    _e,
    profileId: string,
    patch: {
      name?: string;
      defaultCwd?: string;
      defaultTool?: string;
      broadcastInput?: boolean;
      accentColor?: string | null;
    },
  ) => {
    try {
      const profile = updateProfile(profileId, patch);
      return { success: true, profile };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  },
);

ipcMain.handle("profile-delete", (_e, profileId: string) => {
  try {
    deleteProfile(profileId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle("profile-reorder", (_e, orderedProfileIds: string[]) => {
  try {
    const tree = reorderProfiles(orderedProfileIds);
    return { success: true, tree };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

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

ipcMain.handle("relaunch-app", () => {
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

app.whenReady().then(() => {
  setupAppMenu();
  createWindow();
  initAppUpdater(() => mainWindow);
  scheduleStartupUpdateCheck();
});

// Kill all active PTY sessions before the app exits
app.on("before-quit", () => {
  for (const [, proc] of PTY_SESSIONS) {
    try { proc.kill(); } catch { /* already dead */ }
  }
  PTY_SESSIONS.clear();
  closeWorkspaceContext();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { execSync, spawn } from "node:child_process";
import * as pty from "node-pty";
import { detectAll } from "../inventory/index.js";
import { run } from "../utils/exec.js";
import { getMcpConfigPath, tryReadJson, backupFile, writeJson } from "../utils/config.js";

/** Update commands for each AI tool */
const TOOL_UPDATE_COMMANDS: Record<string, { check: string[]; update: string[]; label: string }> = {
  claude: {
    check: ["claude", "--version"],
    update: ["claude", "update"],
    label: "Claude Code",
  },
  copilot: {
    check: ["copilot", "--version"],
    update: ["copilot", "update"],
    label: "GitHub Copilot CLI",
  },
  agent: {
    check: ["agent", "--version"],
    update: ["agent", "update"],
    label: "Cursor",
  },
};

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    title: "AI CLI Inventory",
    icon: join(import.meta.dirname, "..", "assets", "icon.ico"),
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
  });

  mainWindow.loadFile(join(import.meta.dirname, "..", "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle("get-inventory", async () => {
  const entries = await detectAll();
  return entries;
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
  const entries = await detectAll();
  return Promise.all(entries.map(runChecksForEntry));
});

ipcMain.handle("doctor-tool", async (_event, tool: string) => {
  const entries = await detectAll();
  const entry = entries.find((e) => e.tool === tool);
  if (!entry) return { tool, checks: [{ name: "error", status: "fail", detail: `Tool "${tool}" not found` }] };
  return runChecksForEntry(entry);
});

ipcMain.handle("get-env-vars", () => {
  const e = (key: string) => process.env[key];
  return [
    {
      provider: "Claude",
      vars: [
        { key: "ANTHROPIC_API_KEY", set: !!e("ANTHROPIC_API_KEY") },
        { key: "ANTHROPIC_BASE_URL", set: !!e("ANTHROPIC_BASE_URL"), value: e("ANTHROPIC_BASE_URL") },
      ],
    },
    {
      provider: "Copilot",
      vars: [
        { key: "GH_TOKEN", set: !!e("GH_TOKEN") },
        { key: "GITHUB_TOKEN", set: !!e("GITHUB_TOKEN") },
        { key: "COPILOT_HOME", set: !!e("COPILOT_HOME"), value: e("COPILOT_HOME") },
      ],
    },
    {
      provider: "Cursor",
      vars: [
        { key: "CURSOR_API_KEY", set: !!e("CURSOR_API_KEY") },
      ],
    },
  ];
});

/** npm package names for tools that can be version-checked */
const TOOL_NPM_PACKAGE: Record<string, string> = {
  claude: "@anthropic-ai/claude-code",
  "ai-cli-inventory": "ai-cli-inventory",
};

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

  // Fetch npm latest versions in parallel ahead of time
  const npmPkgs = Object.entries(TOOL_NPM_PACKAGE);
  const latestVersionMap: Record<string, string | null> = {};
  await Promise.all(
    npmPkgs.map(async ([tool, pkg]) => {
      latestVersionMap[tool] = await new Promise((resolve) =>
        resolve(fetchLatestNpmVersion(pkg))
      );
    })
  );

  // Per-tool checks
  try {
    const entries = await detectAll();
    for (const entry of entries) {
      const cfg = TOOL_UPDATE_COMMANDS[entry.tool];
      results.push({
        tool: entry.tool,
        label: cfg?.label ?? entry.provider,
        currentVersion: entry.version ?? null,
        latestVersion: latestVersionMap[entry.tool] ?? null,
        available: entry.available,
        updateCommand: cfg ? cfg.update.join(" ") : "",
      });
    }
  } catch {
    // detectAll failed — continue with self only
  }

  // Self (ai-cli-inventory)
  let selfVersion = "unknown";
  try { selfVersion = app.getVersion(); } catch { /* ok */ }

  results.push({
    tool: "ai-cli-inventory",
    label: "AI CLI Inventory (self)",
    currentVersion: selfVersion,
    latestVersion: latestVersionMap["ai-cli-inventory"] ?? null,
    available: true,
    updateCommand: detectSelfUpdateCmd(),
  });

  return { tools: results };
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

  try {
    const entries = await detectAll();
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
  } catch { /* ok */ }

  let selfVersion = "unknown";
  try { selfVersion = app.getVersion(); } catch { /* ok */ }

  results.push({
    tool: "ai-cli-inventory",
    label: "AI CLI Inventory (self)",
    currentVersion: selfVersion,
    latestVersion: null,
    available: true,
    updateCommand: detectSelfUpdateCmd(),
  });

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
  };

  const push = (channel: string, payload: unknown) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
  };

  // Self entry immediately
  let selfVersion = "unknown";
  try { selfVersion = app.getVersion(); } catch { /* ok */ }
  const selfEntry: ToolInfo = {
    tool: "ai-cli-inventory", label: "AI CLI Inventory (self)",
    currentVersion: selfVersion, latestVersion: null,
    available: true, updateCommand: detectSelfUpdateCmd(),
  };
  push("tool-detected", selfEntry);

  // Detect each AI tool individually in parallel, push as each resolves
  const { detectClaude } = await import("../inventory/claude.js");
  const { detectCopilot } = await import("../inventory/copilot.js");
  const { detectCursor } = await import("../inventory/cursor.js");

  const detectors = [detectClaude, detectCopilot, detectCursor];
  const allTools: ToolInfo[] = [selfEntry];

  await Promise.all(detectors.map(async (detect) => {
    try {
      const entry = await detect();
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

  // Now check npm latest for each tool in parallel, push as each resolves
  await Promise.all(allTools.map(async ({ tool }) => {
    const pkg = TOOL_NPM_PACKAGE[tool];
    const latestVersion = pkg ? fetchLatestNpmVersion(pkg) : null;
    push("tool-latest", { tool, latestVersion });
  }));

  push("scan-complete", null);
});

ipcMain.handle("run-update", async (_event, tool: string) => {
  const cliPath = join(import.meta.dirname, "..", "cli.js");
  const cliArg = tool === "ai-cli-inventory" ? "self" : tool;
  const result = await run("node", [cliPath, "update", cliArg], 60_000);
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
        ? "pnpm update -g ai-cli-inventory"
        : pm === "yarn"
          ? "yarn global upgrade ai-cli-inventory"
          : "npm update -g ai-cli-inventory";
    } catch { /* not available */ }
  }
  return "npm update -g ai-cli-inventory";
}

/** Returns only the self (ai-cli-inventory) version and update command — no detectAll(). */
ipcMain.handle("get-self-info", () => {
  let version = "unknown";
  try { version = app.getVersion(); } catch { /* ok */ }
  return { version, updateCommand: detectSelfUpdateCmd() };
});

// --- MCP Sync ---

type McpServerEntry = Record<string, unknown>;
type McpServersMap = Record<string, McpServerEntry>;

const SYNC_TOOLS = ["claude", "copilot", "cursor"] as const;

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
  const result: Record<string, { servers: McpServersMap; configPath: string }> = {};
  for (const tool of SYNC_TOOLS) {
    result[tool] = {
      servers: readMcpServers(tool),
      configPath: getMcpConfigPath(tool),
    };
  }
  return result;
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

ipcMain.handle("open-path", async (_event, filePath: string) => {
  await shell.openPath(filePath);
});

// --- PTY (In-App Terminal) ---

const PTY_SESSIONS = new Map<string, ReturnType<typeof pty.spawn>>();

ipcMain.handle("pick-folder", async (_event, defaultPath?: string) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    ...(defaultPath ? { defaultPath } : {}),
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle("pty-spawn", (event, tool: string, cwd?: string) => {
  const cmd = TOOL_LAUNCH_CMD[tool];
  if (!cmd) return { success: false, error: `Unknown tool: ${tool}` };

  const sessionId = `${tool}-${Date.now()}`;
  const isWin = process.platform === "win32";
  const workDir = cwd || homedir();

  // On Windows: prefer pwsh (loads $PROFILE for prompt themes) → powershell → cmd
  const windowsCandidates: [string, string[]][] = [
    ["pwsh.exe",       ["-NoLogo", "-NoExit", "-Command", cmd]],
    ["powershell.exe", ["-NoLogo", "-NoExit", "-Command", cmd]],
    ["cmd.exe",        ["/k", cmd]],
  ];
  const unixShell = "/bin/bash";
  const unixArgs  = ["-c", `${cmd}; exec bash`];

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
    let proc: ReturnType<typeof pty.spawn> | undefined;

    if (isWin) {
      for (const [sh, args] of windowsCandidates) {
        try { proc = pty.spawn(sh, args, ptyOpts); break; }
        catch { /* try next */ }
      }
      if (!proc) throw new Error("No suitable shell found (pwsh / powershell / cmd)");
    } else {
      proc = pty.spawn(unixShell, unixArgs, ptyOpts);
    }

    PTY_SESSIONS.set(sessionId, proc);

    proc.onData((data) => {
      if (!event.sender.isDestroyed()) event.sender.send("pty-data", { sessionId, data });
    });

    proc.onExit(({ exitCode }) => {
      PTY_SESSIONS.delete(sessionId);
      if (!event.sender.isDestroyed()) event.sender.send("pty-exit", { sessionId, exitCode });
    });

    return { success: true, sessionId };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.on("pty-write",  (_e, sessionId: string, data: string)                    => { PTY_SESSIONS.get(sessionId)?.write(data); });
ipcMain.on("pty-resize", (_e, sessionId: string, cols: number, rows: number)       => { PTY_SESSIONS.get(sessionId)?.resize(cols, rows); });
ipcMain.on("pty-kill",   (_e, sessionId: string)                                   => {
  try { PTY_SESSIONS.get(sessionId)?.kill(); } catch { /* already dead */ }
  PTY_SESSIONS.delete(sessionId);
});

// --- Launch in Terminal ---

const TOOL_LAUNCH_CMD: Record<string, string> = {
  claude: "claude",
  copilot: "copilot",
  cursor: "cursor",
  "cursor-agent": "agent",
  agent: "agent",
};

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

app.whenReady().then(createWindow);

// Kill all active PTY sessions before the app exits
app.on("before-quit", () => {
  for (const [, proc] of PTY_SESSIONS) {
    try { proc.kill(); } catch { /* already dead */ }
  }
  PTY_SESSIONS.clear();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

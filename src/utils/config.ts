import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { canonicalToolId } from "../tools.js";

export function home(...segments: string[]): string {
  return join(homedir(), ...segments);
}

export function cwd(...segments: string[]): string {
  return join(process.cwd(), ...segments);
}

/** True when an env-var value is usable as an absolute directory override. */
function envDir(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  return isAbsolute(raw) ? raw : undefined;
}

/**
 * XDG base config directory: `$XDG_CONFIG_HOME` when set to an absolute path
 * (per the XDG spec relative values are ignored), else `~/.config`.
 */
export function xdgConfigHome(...segments: string[]): string {
  return join(envDir("XDG_CONFIG_HOME") ?? home(".config"), ...segments);
}

/** Claude Code config dir: `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`. */
export function claudeConfigDir(...segments: string[]): string {
  return join(envDir("CLAUDE_CONFIG_DIR") ?? home(".claude"), ...segments);
}

/**
 * Claude Code global state file (user + local-scoped MCP, `projects` map).
 * Lives inside `$CLAUDE_CONFIG_DIR` when that is set, else `~/.claude.json`.
 */
export function claudeJsonPath(): string {
  const dir = envDir("CLAUDE_CONFIG_DIR");
  return dir ? join(dir, ".claude.json") : home(".claude.json");
}

/** Codex home: `$CODEX_HOME` when set, else `~/.codex`. */
export function codexHome(...segments: string[]): string {
  return join(envDir("CODEX_HOME") ?? home(".codex"), ...segments);
}

/** OpenCode global config dir (`$XDG_CONFIG_HOME/opencode`). */
export function opencodeConfigDir(...segments: string[]): string {
  return xdgConfigHome("opencode", ...segments);
}

/**
 * OpenCode global config file: the first existing of `opencode.json` /
 * `opencode.jsonc`, defaulting to `opencode.json` when neither exists.
 */
export function opencodeConfigPath(): string {
  const candidates = [opencodeConfigDir("opencode.json"), opencodeConfigDir("opencode.jsonc")];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export function findExistingPaths(candidates: string[]): string[] {
  return candidates.filter((p) => existsSync(p));
}

/**
 * Strip comments and trailing commas from JSONC text.
 * Uses a state machine to correctly skip string literals.
 */
function stripJsonComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      if (ch === "\\") {
        result += ch + text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      result += ch;
      i++;
      continue;
    }

    // Block comment
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Single-line comment
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }

    if (ch === '"') inString = true;
    result += ch;
    i++;
  }

  // Remove trailing commas before } or ]
  return result.replace(/,(\s*[}\]])/g, "$1");
}

export function tryReadJson<T = unknown>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(stripJsonComments(readFileSync(filePath, "utf-8"))) as T;
  } catch {
    return null;
  }
}

/**
 * Parse JSON leniently (comments and trailing commas allowed). Throws on
 * genuinely malformed input. Used to validate editor content before writing.
 */
export function parseJsonLoose(text: string): unknown {
  return JSON.parse(stripJsonComments(text));
}

export function envPresent(name: string): boolean {
  return !!process.env[name];
}

/** Config file paths for each tool's MCP settings */
export function getMcpConfigPath(tool: string): string {
  switch (canonicalToolId(tool)) {
    case "claude":
      return claudeJsonPath();
    case "copilot":
      return process.env["COPILOT_HOME"]
        ? join(process.env["COPILOT_HOME"], "mcp-config.json")
        : home(".copilot", "mcp-config.json");
    case "cursor":
      return home(".cursor", "mcp.json");
    case "codex":
      return codexHome("config.toml");
    case "gemini":
      return home(".gemini", "settings.json");
    case "opencode":
      return opencodeConfigPath();
    default:
      return "";
  }
}

/** Backup a file before modifying it */
export function backupFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const bakPath = `${filePath}.bak`;
  copyFileSync(filePath, bakPath);
  return bakPath;
}

/** Write JSON to file with pretty formatting */
export function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

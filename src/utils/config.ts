import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function home(...segments: string[]): string {
  return join(homedir(), ...segments);
}

export function cwd(...segments: string[]): string {
  return join(process.cwd(), ...segments);
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

export function envPresent(name: string): boolean {
  return !!process.env[name];
}

/** Config file paths for each tool's MCP settings */
export function getMcpConfigPath(tool: string): string {
  switch (tool) {
    case "claude":
      return home(".claude.json");
    case "copilot":
      return process.env["COPILOT_HOME"]
        ? join(process.env["COPILOT_HOME"], "mcp-config.json")
        : home(".copilot", "mcp-config.json");
    case "cursor":
      return home(".cursor", "mcp.json");
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

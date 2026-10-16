import { existsSync, readFileSync } from "node:fs";
import { findExistingPaths, tryReadJson } from "../utils/config.js";
import { readCodexMcpServers } from "../utils/mcp-codex-toml.js";

/**
 * Collect MCP server names from JSON/JSONC config files.
 * `legacyKeys` are also read (e.g. OpenCode files that older AI Shelf versions
 * wrote under `mcpServers` instead of OpenCode's `mcp` key).
 */
export function collectMcpServersFromJsonFiles(
  candidates: string[],
  serversKey = "mcpServers",
  legacyKeys: string[] = [],
): { servers: string[]; configPaths: string[] } {
  const configPaths = findExistingPaths(candidates);
  const mcpServers: string[] = [];
  for (const p of configPaths) {
    const data = tryReadJson<Record<string, unknown>>(p);
    if (!data) continue;
    for (const key of [serversKey, ...legacyKeys]) {
      const servers = data[key];
      if (servers && typeof servers === "object" && !Array.isArray(servers)) {
        mcpServers.push(...Object.keys(servers as object));
      }
    }
  }
  return { servers: [...new Set(mcpServers)], configPaths };
}

/**
 * Server names from `[mcp_servers.NAME]` tables in Codex `config.toml`.
 * Sub-tables such as `[mcp_servers.NAME.env]` belong to NAME and are not servers.
 */
export function parseCodexMcpServers(configPath: string): string[] {
  return Object.keys(readCodexMcpServers(configPath));
}

/** Read `model = "..."` from Codex TOML config. */
export function parseCodexModel(configPath: string): string | undefined {
  if (!existsSync(configPath)) return undefined;
  try {
    const text = readFileSync(configPath, "utf-8");
    const m = text.match(/^model\s*=\s*["']?([^"'\n]+)["']?/m);
    return m?.[1]?.trim();
  } catch {
    return undefined;
  }
}

/** Read `model:` from a simple YAML aider config. */
export function parseAiderModelFromYaml(configPath: string): string | undefined {
  if (!existsSync(configPath)) return undefined;
  try {
    const text = readFileSync(configPath, "utf-8");
    const m = text.match(/^model:\s*(.+)$/m);
    return m?.[1]?.trim();
  } catch {
    return undefined;
  }
}

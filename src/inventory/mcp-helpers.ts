import { existsSync, readFileSync } from "node:fs";
import { findExistingPaths, tryReadJson } from "../utils/config.js";

/** Collect MCP server names from JSON/JSONC config files. */
export function collectMcpServersFromJsonFiles(
  candidates: string[],
  serversKey = "mcpServers",
): { servers: string[]; configPaths: string[] } {
  const configPaths = findExistingPaths(candidates);
  const mcpServers: string[] = [];
  for (const p of configPaths) {
    const data = tryReadJson<Record<string, unknown>>(p);
    if (!data) continue;
    const servers = data[serversKey];
    if (servers && typeof servers === "object") {
      mcpServers.push(...Object.keys(servers as object));
    }
    const mcp = data["mcp"];
    if (mcp && typeof mcp === "object") {
      mcpServers.push(...Object.keys(mcp as object));
    }
  }
  return { servers: [...new Set(mcpServers)], configPaths };
}

/** Parse `[mcp_servers.NAME]` tables from Codex `config.toml`. */
export function parseCodexMcpServers(configPath: string): string[] {
  if (!existsSync(configPath)) return [];
  try {
    const text = readFileSync(configPath, "utf-8");
    const names: string[] = [];
    const re = /\[mcp_servers\.([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) names.push(m[1]);
    return [...new Set(names)];
  } catch {
    return [];
  }
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

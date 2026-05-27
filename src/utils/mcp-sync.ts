import { existsSync } from "node:fs";
import { MCP_SYNC_TOOL_IDS } from "../tools.js";
import { backupFile, getMcpConfigPath, tryReadJson, writeJson } from "./config.js";
import {
  adaptMcpForCodex,
  adaptMcpFromCodex,
  appendCodexMcpServers,
  readCodexMcpServers,
  validateCodexConfig,
  type McpServerEntry,
} from "./mcp-codex-toml.js";

export type McpServersMap = Record<string, McpServerEntry>;

export const SYNC_TOOLS = MCP_SYNC_TOOL_IDS;

function isCodexTool(tool: string): boolean {
  return tool === "codex";
}

/** Validate an MCP config file for a given tool (JSON or Codex TOML). */
export function validateMcpConfigPath(tool: string, configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  if (isCodexTool(tool) || configPath.endsWith(".toml")) {
    return validateCodexConfig(configPath);
  }
  return tryReadJson(configPath) !== null;
}

/** Read MCP servers from a tool's config file. */
export function readMcpServers(tool: string): McpServersMap {
  const configPath = getMcpConfigPath(tool);
  if (!configPath || !existsSync(configPath)) return {};

  if (isCodexTool(tool)) {
    const servers = readCodexMcpServers(configPath);
    return Object.fromEntries(
      Object.entries(servers).map(([name, entry]) => [name, adaptMcpFromCodex(entry)]),
    );
  }

  const data = tryReadJson<Record<string, unknown>>(configPath);
  if (!data) return {};
  const servers = data["mcpServers"];
  if (servers && typeof servers === "object") {
    return servers as McpServersMap;
  }
  return {};
}

/** Adapt an MCP entry for a target tool's config format. */
export function adaptMcpEntry(source: McpServerEntry, tool: string): McpServerEntry {
  if (isCodexTool(tool)) return adaptMcpForCodex(source);

  const adapted = { ...source };
  if (tool === "cursor" && !adapted["type"]) {
    adapted["type"] = adapted["url"] ? "streamableHttp" : "command";
  } else if (tool !== "cursor") {
    delete adapted["type"];
  }
  return adapted;
}

export interface McpSyncWriteResult {
  added: string[];
  skipped: string[];
  error?: string;
}

/** Write missing MCP servers into a tool's config. */
export function writeMcpServers(
  tool: string,
  serverNames: string[],
  allServers: McpServersMap,
): McpSyncWriteResult {
  const configPath = getMcpConfigPath(tool);
  if (!configPath) {
    return { added: [], skipped: [], error: "Unknown tool" };
  }

  const added: string[] = [];
  const skipped: string[] = [];

  try {
    if (isCodexTool(tool)) {
      const existing = readCodexMcpServers(configPath);
      const additions: McpServersMap = {};

      for (const name of serverNames) {
        if (existing[name]) {
          skipped.push(name);
          continue;
        }
        const source = allServers[name];
        if (!source) continue;
        additions[name] = adaptMcpEntry(source, tool);
      }

      if (Object.keys(additions).length > 0) backupFile(configPath);
      const written = appendCodexMcpServers(configPath, additions);
      added.push(...written);
      return { added, skipped };
    }

    let data: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      data = tryReadJson<Record<string, unknown>>(configPath) ?? {};
    }
    const existing = (data["mcpServers"] as McpServersMap) ?? {};

    for (const name of serverNames) {
      if (existing[name]) {
        skipped.push(name);
        continue;
      }
      const source = allServers[name];
      if (!source) continue;
      existing[name] = adaptMcpEntry(source, tool);
      added.push(name);
    }

    if (added.length > 0) {
      backupFile(configPath);
      data["mcpServers"] = existing;
      writeJson(configPath, data);
    }

    return { added, skipped };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { added: [], skipped: [], error: message };
  }
}

/** Collect the union of all MCP servers across sync-enabled tools. */
export function collectAllMcpServers(): McpServersMap {
  const allServers: McpServersMap = {};
  for (const tool of SYNC_TOOLS) {
    const servers = readMcpServers(tool);
    for (const [name, config] of Object.entries(servers)) {
      if (!allServers[name]) allServers[name] = config;
    }
  }
  return allServers;
}

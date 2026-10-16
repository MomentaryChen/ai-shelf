import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { backupFile, getMcpConfigPath, tryReadJson, writeJson } from "./config.js";
import {
  adaptMcpFromCodex,
  readCodexMcpServers,
  removeCodexMcpServer,
  setCodexMcpServerEnabled,
  upsertCodexMcpServer,
  type McpServerEntry,
} from "./mcp-codex-toml.js";
import {
  OPENCODE_MCP_KEY,
  adaptMcpForOpenCode,
  adaptMcpFromOpenCode,
  isOpenCodeMcpEnabled,
  migrateOpenCodeLegacyMcp,
} from "./mcp-opencode.js";

/**
 * Server-level CRUD on a tool's MCP config — add / replace / delete / toggle.
 * Complements mcp-sync.ts (which only copies missing servers across tools).
 *
 * JSON tools: enabled servers live under `mcpServers`; disabled ones are moved
 * into a sidecar `mcpServersDisabled` object so the tool stops loading them
 * while the definition is preserved and reversible.
 * Codex (TOML): native `enabled` flag on each `[mcp_servers.*]` block.
 * OpenCode: servers live under `mcp` with a native `enabled` flag; legacy
 * `mcpServers` / `mcpServersDisabled` blocks are migrated into `mcp` on write.
 */

const DISABLED_KEY = "mcpServersDisabled";

export type McpConfigFormat = "json" | "toml" | "unknown";

export interface McpServerRecord {
  name: string;
  entry: McpServerEntry;
  enabled: boolean;
}

export interface McpListResult {
  tool: string;
  configPath: string;
  format: McpConfigFormat;
  /** True when structured (add/delete/toggle) editing is supported for this tool. */
  supported: boolean;
  servers: McpServerRecord[];
  error?: string;
}

export interface McpEditResult {
  success: boolean;
  error?: string;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatFor(tool: string, configPath: string): McpConfigFormat {
  if (!configPath) return "unknown";
  if (tool === "codex" || configPath.endsWith(".toml")) return "toml";
  if (configPath.endsWith(".json") || configPath.endsWith(".jsonc")) return "json";
  return "unknown";
}

function readJsonMaps(configPath: string, tool = ""): {
  data: Record<string, unknown>;
  enabled: Record<string, McpServerEntry>;
  disabled: Record<string, McpServerEntry>;
} {
  const data = existsSync(configPath)
    ? (tryReadJson<Record<string, unknown>>(configPath) ?? {})
    : {};
  if (tool === "opencode") return readOpenCodeMaps(data);
  const enabled = (data["mcpServers"] as Record<string, McpServerEntry>) ?? {};
  const disabled = (data[DISABLED_KEY] as Record<string, McpServerEntry>) ?? {};
  return { data, enabled, disabled };
}

/**
 * OpenCode: split `mcp` (plus migrated legacy blocks) into canonical
 * enabled/disabled maps keyed off OpenCode's native `enabled` flag.
 */
function readOpenCodeMaps(data: Record<string, unknown>): {
  data: Record<string, unknown>;
  enabled: Record<string, McpServerEntry>;
  disabled: Record<string, McpServerEntry>;
} {
  const legacyDisabled = data[DISABLED_KEY] as Record<string, McpServerEntry> | undefined;
  migrateOpenCodeLegacyMcp(data);
  const mcp = { ...((data[OPENCODE_MCP_KEY] as Record<string, McpServerEntry>) ?? {}) };
  if (legacyDisabled && typeof legacyDisabled === "object") {
    for (const [name, entry] of Object.entries(legacyDisabled)) {
      if (!(name in mcp)) mcp[name] = adaptMcpForOpenCode(entry, false);
    }
  }
  delete data[DISABLED_KEY];

  const enabled: Record<string, McpServerEntry> = {};
  const disabled: Record<string, McpServerEntry> = {};
  for (const [name, entry] of Object.entries(mcp)) {
    if (!entry || typeof entry !== "object") continue;
    if (isOpenCodeMcpEnabled(entry)) enabled[name] = adaptMcpFromOpenCode(entry);
    else disabled[name] = adaptMcpFromOpenCode(entry);
  }
  return { data, enabled, disabled };
}

function writeJsonMaps(
  configPath: string,
  data: Record<string, unknown>,
  enabled: Record<string, McpServerEntry>,
  disabled: Record<string, McpServerEntry>,
  tool = "",
): void {
  if (tool === "opencode") {
    const mcp: Record<string, McpServerEntry> = {};
    for (const [name, entry] of Object.entries(enabled)) mcp[name] = adaptMcpForOpenCode(entry, true);
    for (const [name, entry] of Object.entries(disabled)) mcp[name] = adaptMcpForOpenCode(entry, false);
    data[OPENCODE_MCP_KEY] = mcp;
    delete data["mcpServers"];
    delete data[DISABLED_KEY];
  } else {
    data["mcpServers"] = enabled;
    if (Object.keys(disabled).length > 0) data[DISABLED_KEY] = disabled;
    else delete data[DISABLED_KEY];
  }
  if (existsSync(configPath)) backupFile(configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  writeJson(configPath, data);
}

/** List every MCP server (enabled and disabled) for a tool. */
export function listMcpServersDetailed(tool: string): McpListResult {
  const configPath = getMcpConfigPath(tool);
  const format = formatFor(tool, configPath);
  if (!configPath) {
    return { tool, configPath: "", format, supported: false, servers: [] };
  }

  try {
    if (format === "toml") {
      const raw = readCodexMcpServers(configPath);
      const servers = Object.entries(raw).map(([name, entry]) => ({
        name,
        entry: adaptMcpFromCodex(entry),
        enabled: entry["enabled"] !== false,
      }));
      return { tool, configPath, format, supported: true, servers };
    }

    if (format === "json") {
      const { enabled, disabled } = readJsonMaps(configPath, tool);
      const servers: McpServerRecord[] = [
        ...Object.entries(enabled).map(([name, entry]) => ({ name, entry, enabled: true })),
        ...Object.entries(disabled).map(([name, entry]) => ({ name, entry, enabled: false })),
      ];
      return { tool, configPath, format, supported: true, servers };
    }

    return { tool, configPath, format, supported: false, servers: [] };
  } catch (err) {
    return { tool, configPath, format, supported: false, servers: [], error: errMsg(err) };
  }
}

/** Add a new MCP server or replace an existing one. */
export function upsertMcpServer(
  tool: string,
  name: string,
  entry: McpServerEntry,
  enabled = true,
): McpEditResult {
  const configPath = getMcpConfigPath(tool);
  if (!configPath) return { success: false, error: "Unknown tool" };
  if (!name || !name.trim()) return { success: false, error: "Server name is required" };
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { success: false, error: "Server config must be a JSON object" };
  }

  const serverName = name.trim();
  try {
    const format = formatFor(tool, configPath);
    if (format === "toml") {
      if (existsSync(configPath)) backupFile(configPath);
      upsertCodexMcpServer(configPath, serverName, { ...entry, enabled });
      return { success: true };
    }
    if (format !== "json") return { success: false, error: "Unsupported config format" };

    const { data, enabled: enabledMap, disabled: disabledMap } = readJsonMaps(configPath, tool);
    delete enabledMap[serverName];
    delete disabledMap[serverName];
    if (enabled) enabledMap[serverName] = entry;
    else disabledMap[serverName] = entry;
    writeJsonMaps(configPath, data, enabledMap, disabledMap, tool);
    return { success: true };
  } catch (err) {
    return { success: false, error: errMsg(err) };
  }
}

/** Delete an MCP server from a tool's config. */
export function deleteMcpServer(tool: string, name: string): McpEditResult {
  const configPath = getMcpConfigPath(tool);
  if (!configPath) return { success: false, error: "Unknown tool" };
  if (!existsSync(configPath)) return { success: false, error: "Config file not found" };

  try {
    const format = formatFor(tool, configPath);
    if (format === "toml") {
      backupFile(configPath);
      const removed = removeCodexMcpServer(configPath, name);
      return removed ? { success: true } : { success: false, error: `Server "${name}" not found` };
    }
    if (format !== "json") return { success: false, error: "Unsupported config format" };

    const { data, enabled: enabledMap, disabled: disabledMap } = readJsonMaps(configPath, tool);
    if (!(name in enabledMap) && !(name in disabledMap)) {
      return { success: false, error: `Server "${name}" not found` };
    }
    delete enabledMap[name];
    delete disabledMap[name];
    writeJsonMaps(configPath, data, enabledMap, disabledMap, tool);
    return { success: true };
  } catch (err) {
    return { success: false, error: errMsg(err) };
  }
}

/** Enable or disable an MCP server without deleting its definition. */
export function setMcpServerEnabled(
  tool: string,
  name: string,
  enabled: boolean,
): McpEditResult {
  const configPath = getMcpConfigPath(tool);
  if (!configPath) return { success: false, error: "Unknown tool" };
  if (!existsSync(configPath)) return { success: false, error: "Config file not found" };

  try {
    const format = formatFor(tool, configPath);
    if (format === "toml") {
      backupFile(configPath);
      const ok = setCodexMcpServerEnabled(configPath, name, enabled);
      return ok ? { success: true } : { success: false, error: `Server "${name}" not found` };
    }
    if (format !== "json") return { success: false, error: "Unsupported config format" };

    const { data, enabled: enabledMap, disabled: disabledMap } = readJsonMaps(configPath, tool);
    const entry = enabledMap[name] ?? disabledMap[name];
    if (!entry) return { success: false, error: `Server "${name}" not found` };
    delete enabledMap[name];
    delete disabledMap[name];
    if (enabled) enabledMap[name] = entry;
    else disabledMap[name] = entry;
    writeJsonMaps(configPath, data, enabledMap, disabledMap, tool);
    return { success: true };
  } catch (err) {
    return { success: false, error: errMsg(err) };
  }
}

import { existsSync } from "node:fs";
import { tryReadJson } from "./config.js";
import type { McpServerEntry } from "./mcp-codex-toml.js";

/**
 * OpenCode keeps MCP servers under the top-level `mcp` key of `opencode.json`
 * (not `mcpServers`), with its own entry shape:
 *
 *   local:  { "type": "local",  "command": ["npx", "-y", "pkg"], "environment": {…}, "enabled": true }
 *   remote: { "type": "remote", "url": "https://…", "headers": {…}, "enabled": true }
 *
 * Older AI Shelf versions wrote Claude-style entries under `mcpServers`, which
 * OpenCode ignores. Reads merge those legacy entries in; writes migrate them
 * into `mcp` and drop the stale key.
 */

export const OPENCODE_MCP_KEY = "mcp";
export const OPENCODE_LEGACY_MCP_KEY = "mcpServers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

/** Convert a canonical (Claude-style) MCP entry to OpenCode's `mcp` entry shape. */
export function adaptMcpForOpenCode(entry: McpServerEntry, enabled = true): McpServerEntry {
  const out: McpServerEntry = {};
  const url = entry["url"];

  if (typeof url === "string" && url.length > 0) {
    out["type"] = "remote";
    out["url"] = url;
    if (isRecord(entry["headers"])) out["headers"] = entry["headers"];
  } else {
    out["type"] = "local";
    const command = entry["command"];
    out["command"] = Array.isArray(command)
      ? stringArray(command)
      : [
          ...(typeof command === "string" && command.length > 0 ? [command] : []),
          ...stringArray(entry["args"]),
        ];
    const env = isRecord(entry["environment"]) ? entry["environment"] : entry["env"];
    if (isRecord(env) && Object.keys(env).length > 0) out["environment"] = env;
  }

  if (typeof entry["timeout"] === "number") out["timeout"] = entry["timeout"];
  out["enabled"] = enabled;
  return out;
}

/** Convert an OpenCode `mcp` entry to the canonical shape used for cross-tool sync. */
export function adaptMcpFromOpenCode(entry: McpServerEntry): McpServerEntry {
  // Legacy Claude-style entry (written under `mcpServers` by older versions).
  if (
    typeof entry["command"] === "string" ||
    (!entry["type"] && !Array.isArray(entry["command"]))
  ) {
    const out: McpServerEntry = { ...entry };
    delete out["enabled"];
    delete out["type"];
    return out;
  }

  const out: McpServerEntry = {};
  if (entry["type"] === "remote" || typeof entry["url"] === "string") {
    out["url"] = entry["url"];
    if (isRecord(entry["headers"])) out["headers"] = entry["headers"];
  } else {
    const [command, ...args] = stringArray(entry["command"]);
    if (command) out["command"] = command;
    if (args.length > 0) out["args"] = args;
    if (isRecord(entry["environment"])) out["env"] = entry["environment"];
  }
  if (typeof entry["timeout"] === "number") out["timeout"] = entry["timeout"];
  return out;
}

/** True when an OpenCode entry is enabled (OpenCode defaults `enabled` to true). */
export function isOpenCodeMcpEnabled(entry: McpServerEntry): boolean {
  return entry["enabled"] !== false;
}

/**
 * Move legacy `mcpServers` entries into `mcp` (OpenCode shape) and delete the
 * stale key. Entries already present under `mcp` win. Returns true when `data`
 * was modified.
 */
export function migrateOpenCodeLegacyMcp(data: Record<string, unknown>): boolean {
  const legacy = data[OPENCODE_LEGACY_MCP_KEY];
  if (legacy === undefined) return false;

  const mcp = isRecord(data[OPENCODE_MCP_KEY]) ? { ...data[OPENCODE_MCP_KEY] } : {};
  if (isRecord(legacy)) {
    for (const [name, entry] of Object.entries(legacy)) {
      if (name in mcp || !isRecord(entry)) continue;
      mcp[name] = adaptMcpForOpenCode(entry, entry["enabled"] !== false);
    }
  }
  data[OPENCODE_MCP_KEY] = mcp;
  delete data[OPENCODE_LEGACY_MCP_KEY];
  return true;
}

/**
 * Raw OpenCode-shaped MCP entries from a config object, with legacy
 * `mcpServers` entries folded in (converted to OpenCode shape).
 */
export function openCodeMcpEntries(data: Record<string, unknown>): Record<string, McpServerEntry> {
  const copy: Record<string, unknown> = {
    [OPENCODE_MCP_KEY]: data[OPENCODE_MCP_KEY],
    [OPENCODE_LEGACY_MCP_KEY]: data[OPENCODE_LEGACY_MCP_KEY],
  };
  migrateOpenCodeLegacyMcp(copy);
  const mcp = copy[OPENCODE_MCP_KEY];
  if (!isRecord(mcp)) return {};
  const out: Record<string, McpServerEntry> = {};
  for (const [name, entry] of Object.entries(mcp)) {
    if (isRecord(entry)) out[name] = entry;
  }
  return out;
}

/** Read OpenCode MCP entries (OpenCode shape, legacy entries folded in) from disk. */
export function readOpenCodeMcpServers(configPath: string): Record<string, McpServerEntry> {
  if (!existsSync(configPath)) return {};
  const data = tryReadJson<Record<string, unknown>>(configPath);
  return data ? openCodeMcpEntries(data) : {};
}

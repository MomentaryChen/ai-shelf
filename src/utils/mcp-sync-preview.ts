import {
  SYNC_TOOLS,
  adaptMcpEntry,
  collectAllMcpServers,
  readMcpServers,
  type McpServersMap,
} from "./mcp-sync.js";
import type { McpServerEntry } from "./mcp-codex-toml.js";
import { isMcpForbidden, type TeamPolicy } from "../shared/team-policy.js";

export type McpSyncPreviewAction = "add" | "skip" | "conflict" | "blocked";

export type McpSyncPreviewItem = {
  serverName: string;
  targetTool: string;
  action: McpSyncPreviewAction;
  /** Tool the entry would be copied from (preferred source / first provider). */
  sourceTool?: string;
  /** JSON preview of the entry that would be written (add only). */
  incomingJson?: string;
  /** Existing entry in target when names collide (conflict). */
  existingJson?: string;
  /** Why the write was blocked (e.g. team policy forbid). */
  reason?: string;
};

function stableJson(entry: McpServerEntry): string {
  return JSON.stringify(entry, Object.keys(entry).sort(), 2);
}

function entriesMatch(a: McpServerEntry, b: McpServerEntry): boolean {
  return stableJson(a) === stableJson(b);
}

function findSourceTool(
  serverName: string,
  allServers: McpServersMap,
  preferredSource?: string,
): string | undefined {
  if (preferredSource) {
    const preferred = readMcpServers(preferredSource);
    if (preferred[serverName]) return preferredSource;
  }
  for (const tool of SYNC_TOOLS) {
    const servers = readMcpServers(tool);
    if (servers[serverName]) return tool;
  }
  return allServers[serverName] ? preferredSource || SYNC_TOOLS[0] : undefined;
}

/** Preview MCP sync without writing — surfaces adds, skips, conflicts, and policy blocks. */
export function previewMcpSync(opts: {
  serverNames: string[];
  targetTools: string[];
  sourceTool?: string;
  policy?: TeamPolicy;
}): McpSyncPreviewItem[] {
  const { serverNames, targetTools, sourceTool, policy } = opts;
  const allServers = collectAllMcpServers(sourceTool);
  const items: McpSyncPreviewItem[] = [];

  for (const targetTool of targetTools) {
    const existing = readMcpServers(targetTool);
    for (const serverName of serverNames) {
      if (policy && isMcpForbidden(policy, serverName)) {
        items.push({
          serverName,
          targetTool,
          action: "blocked",
          sourceTool: findSourceTool(serverName, allServers, sourceTool),
          reason: "forbidden by team policy",
        });
        continue;
      }

      const resolvedSource = findSourceTool(serverName, allServers, sourceTool);
      const source = allServers[serverName];
      if (!source) continue;

      const adapted = adaptMcpEntry(source, targetTool);
      const current = existing[serverName];

      if (!current) {
        items.push({
          serverName,
          targetTool,
          action: "add",
          sourceTool: resolvedSource,
          incomingJson: stableJson(adapted),
        });
      } else if (entriesMatch(current, adapted)) {
        items.push({ serverName, targetTool, action: "skip", sourceTool: resolvedSource });
      } else {
        items.push({
          serverName,
          targetTool,
          action: "conflict",
          sourceTool: resolvedSource,
          existingJson: stableJson(current),
          incomingJson: stableJson(adapted),
        });
      }
    }
  }

  return items;
}

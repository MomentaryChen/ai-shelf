import { SYNC_TOOLS, adaptMcpEntry, collectAllMcpServers, readMcpServers, type McpServersMap } from "./mcp-sync.js";
import type { McpServerEntry } from "./mcp-codex-toml.js";

export type McpSyncPreviewAction = "add" | "skip" | "conflict";

export type McpSyncPreviewItem = {
  serverName: string;
  targetTool: string;
  action: McpSyncPreviewAction;
  /** Tool the entry would be copied from (first provider that has it). */
  sourceTool?: string;
  /** JSON preview of the entry that would be written (add only). */
  incomingJson?: string;
  /** Existing entry in target when names collide (conflict). */
  existingJson?: string;
};

function stableJson(entry: McpServerEntry): string {
  return JSON.stringify(entry, Object.keys(entry).sort(), 2);
}

function entriesMatch(a: McpServerEntry, b: McpServerEntry): boolean {
  return stableJson(a) === stableJson(b);
}

function findSourceTool(serverName: string, allServers: McpServersMap): string | undefined {
  for (const tool of SYNC_TOOLS) {
    const servers = readMcpServers(tool);
    if (servers[serverName]) return tool;
  }
  return allServers[serverName] ? SYNC_TOOLS[0] : undefined;
}

/** Preview MCP sync without writing — surfaces adds, skips, and config conflicts. */
export function previewMcpSync(opts: {
  serverNames: string[];
  targetTools: string[];
}): McpSyncPreviewItem[] {
  const { serverNames, targetTools } = opts;
  const allServers = collectAllMcpServers();
  const items: McpSyncPreviewItem[] = [];

  for (const targetTool of targetTools) {
    const existing = readMcpServers(targetTool);
    for (const serverName of serverNames) {
      const sourceTool = findSourceTool(serverName, allServers);
      const source = allServers[serverName];
      if (!source) continue;

      const adapted = adaptMcpEntry(source, targetTool);
      const current = existing[serverName];

      if (!current) {
        items.push({
          serverName,
          targetTool,
          action: "add",
          sourceTool,
          incomingJson: stableJson(adapted),
        });
      } else if (entriesMatch(current, adapted)) {
        items.push({ serverName, targetTool, action: "skip", sourceTool });
      } else {
        items.push({
          serverName,
          targetTool,
          action: "conflict",
          sourceTool,
          existingJson: stableJson(current),
          incomingJson: stableJson(adapted),
        });
      }
    }
  }

  return items;
}

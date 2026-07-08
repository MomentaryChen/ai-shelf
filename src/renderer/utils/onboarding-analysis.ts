import { MCP_SYNC_TOOL_IDS } from "../../tools.js";
import type { McpRawData, ProfileForest, ProviderEntry } from "../types";

export interface McpSyncGap {
  serverName: string;
  missingIn: string[];
  sourceTools: string[];
}

function isCursorEntry(entry: ProviderEntry): boolean {
  return entry.tool === "cursor" || entry.tool === "agent" || entry.tool === "cursor-agent";
}

function entryMatchesTool(entry: ProviderEntry, toolId: string): boolean {
  if (toolId === "cursor") return isCursorEntry(entry);
  return entry.tool === toolId;
}

export function getInstalledEntries(data: ProviderEntry[]): ProviderEntry[] {
  return data.filter((e) => e.available);
}

export function getAuthGaps(data: ProviderEntry[]): ProviderEntry[] {
  return getInstalledEntries(data).filter(
    (e) => e.auth === "missing" || e.auth === "expired",
  );
}

export function installedMcpSyncTools(data: ProviderEntry[]): string[] {
  return MCP_SYNC_TOOL_IDS.filter((toolId) =>
    data.some(
      (e) => entryMatchesTool(e, toolId) && e.available && e.mcp.supported,
    ),
  );
}

export function computeMcpSyncGaps(
  data: ProviderEntry[],
  rawData: McpRawData | null,
): McpSyncGap[] {
  if (!rawData) return [];

  const syncTools = installedMcpSyncTools(data);
  if (syncTools.length < 2) return [];

  const allServerNames = new Set<string>();
  for (const tool of syncTools) {
    for (const name of Object.keys(rawData[tool]?.servers ?? {})) {
      allServerNames.add(name);
    }
  }

  const gaps: McpSyncGap[] = [];
  for (const serverName of [...allServerNames].sort()) {
    const hasIn = syncTools.filter((tool) => rawData[tool]?.servers?.[serverName]);
    const missingIn = syncTools.filter((tool) => !rawData[tool]?.servers?.[serverName]);
    if (hasIn.length > 0 && missingIn.length > 0) {
      gaps.push({ serverName, missingIn, sourceTools: hasIn });
    }
  }
  return gaps;
}

export function countProfiles(forest: ProfileForest | undefined): number {
  return forest?.groups.reduce((n, g) => n + g.profiles.length, 0) ?? 0;
}

export function mcpSyncPayloadFromGaps(gaps: McpSyncGap[]): {
  serverNames: string[];
  targetTools: string[];
} {
  const serverNames = [...new Set(gaps.map((g) => g.serverName))].sort();
  const targetTools = [...new Set(gaps.flatMap((g) => g.missingIn))].sort();
  return { serverNames, targetTools };
}

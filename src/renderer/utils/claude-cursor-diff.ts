import type { McpRawData, ProviderEntry } from "../types";

const CURSOR_TOOL_ALIASES = new Set(["cursor", "agent", "cursor-agent"]);

export function isCursorTool(tool: string): boolean {
  return CURSOR_TOOL_ALIASES.has(tool);
}

export function findProviderEntry(
  data: ProviderEntry[],
  toolId: "claude" | "cursor",
): ProviderEntry | undefined {
  return data.find((e) =>
    toolId === "claude" ? e.tool === "claude" : isCursorTool(e.tool),
  );
}

/** MCP servers present in Claude config but missing from Cursor. */
export function mcpServersMissingInCursor(rawData: McpRawData): string[] {
  const claudeServers = Object.keys(rawData.claude?.servers ?? {});
  const cursorServers = new Set(Object.keys(rawData.cursor?.servers ?? {}));
  return claudeServers.filter((name) => !cursorServers.has(name)).sort();
}

/** SKILL.md skills present in Claude inventory but missing from Cursor. */
export function skillsMissingInCursor(
  claude?: ProviderEntry,
  cursor?: ProviderEntry,
): string[] {
  if (!claude?.available || !cursor?.available) return [];
  const cursorSkills = new Set(cursor.skills);
  return claude.skills.filter((s) => !cursorSkills.has(s)).sort();
}

/** @deprecated Use skillsMissingInCursor — kept for callers during transition. */
export const skillTagsMissingInCursor = skillsMissingInCursor;

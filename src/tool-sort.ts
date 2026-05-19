import type { ProviderEntry } from "./inventory/types.js";

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude",
  copilot: "Copilot",
  cursor: "Cursor",
  "cursor-agent": "Cursor",
  agent: "Cursor",
};

/** Display name used for sorting and UI labels. */
export function toolDisplayName(tool: string, provider?: string): string {
  return TOOL_DISPLAY_NAMES[tool] ?? provider ?? tool;
}

export function sortProviderEntries(entries: ProviderEntry[]): ProviderEntry[] {
  return [...entries].sort((a, b) =>
    toolDisplayName(a.tool, a.provider).localeCompare(
      toolDisplayName(b.tool, b.provider),
      undefined,
      { sensitivity: "base" },
    ),
  );
}

export function sortByDisplayName<T>(items: T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) =>
    nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" }),
  );
}

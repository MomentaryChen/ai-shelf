import type { PaneInfo } from "../terminal/split-tree";
import { toolLabel } from "../utils";
import { getStoredT } from "../i18n/stored-locale.js";
import { isPlainShellTool } from "./available-tools";
import { numberedPaneLabels } from "./pane-label-numbering";

const MAX_PANE_TITLE_LEN = 64;

export function normalizePaneTitle(raw: string): string | undefined {
  const trimmed = raw.trim().slice(0, MAX_PANE_TITLE_LEN);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Short tool name for pane titles (localized for the plain shell). */
export function paneToolLabel(tool: string): string {
  return isPlainShellTool(tool) ? getStoredT("pane.label.shell") : toolLabel(tool);
}

export function paneDisplayLabel(pane: Pick<PaneInfo, "tool" | "title">): string {
  const custom = pane.title?.trim();
  return custom || paneToolLabel(pane.tool);
}

/** Labels for every pane in a profile — same-tool panes get "Shell 1", "Shell 2". */
export function paneDisplayLabels(
  panes: readonly Pick<PaneInfo, "id" | "tool" | "title">[],
): Record<string, string> {
  return numberedPaneLabels(panes, paneToolLabel);
}

export function paneMatchesQuery(pane: Pick<PaneInfo, "tool" | "title">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    paneDisplayLabel(pane).toLowerCase().includes(q) ||
    toolLabel(pane.tool).toLowerCase().includes(q)
  );
}

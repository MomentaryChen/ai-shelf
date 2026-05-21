import type { PaneInfo } from "../terminal/split-tree";
import { toolLabel } from "../utils";

const MAX_PANE_TITLE_LEN = 64;

export function normalizePaneTitle(raw: string): string | undefined {
  const trimmed = raw.trim().slice(0, MAX_PANE_TITLE_LEN);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function paneDisplayLabel(pane: Pick<PaneInfo, "tool" | "title">): string {
  const custom = pane.title?.trim();
  return custom || toolLabel(pane.tool);
}

export function paneMatchesQuery(pane: Pick<PaneInfo, "tool" | "title">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    paneDisplayLabel(pane).toLowerCase().includes(q) ||
    toolLabel(pane.tool).toLowerCase().includes(q)
  );
}

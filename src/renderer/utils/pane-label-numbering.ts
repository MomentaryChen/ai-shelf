export interface NumberablePane {
  id: string;
  tool: string;
  title?: string;
  autoTitle?: string;
}

/** User title first, then the program-set (OSC 0 / 2) auto-title; "" when neither. */
export function paneCustomLabel(pane: Pick<NumberablePane, "title" | "autoTitle">): string {
  return pane.title?.trim() || pane.autoTitle?.trim() || "";
}

/**
 * Pane id → display label. Custom / auto titles win; otherwise the tool label,
 * numbered ("Shell 1", "Shell 2") only when several untitled panes share the same tool.
 */
export function numberedPaneLabels(
  panes: readonly NumberablePane[],
  baseLabel: (tool: string) => string,
): Record<string, string> {
  const untitledPerTool = new Map<string, number>();
  for (const pane of panes) {
    if (paneCustomLabel(pane)) continue;
    untitledPerTool.set(pane.tool, (untitledPerTool.get(pane.tool) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const labels: Record<string, string> = {};
  for (const pane of panes) {
    const custom = paneCustomLabel(pane);
    if (custom) {
      labels[pane.id] = custom;
      continue;
    }
    const base = baseLabel(pane.tool);
    if ((untitledPerTool.get(pane.tool) ?? 0) < 2) {
      labels[pane.id] = base;
      continue;
    }
    const n = (seen.get(pane.tool) ?? 0) + 1;
    seen.set(pane.tool, n);
    labels[pane.id] = `${base} ${n}`;
  }
  return labels;
}

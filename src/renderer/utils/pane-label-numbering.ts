export interface NumberablePane {
  id: string;
  tool: string;
  title?: string;
}

/**
 * Pane id → display label. Custom titles win; otherwise the tool label, numbered
 * ("Shell 1", "Shell 2") only when several untitled panes share the same tool.
 */
export function numberedPaneLabels(
  panes: readonly NumberablePane[],
  baseLabel: (tool: string) => string,
): Record<string, string> {
  const untitledPerTool = new Map<string, number>();
  for (const pane of panes) {
    if (pane.title?.trim()) continue;
    untitledPerTool.set(pane.tool, (untitledPerTool.get(pane.tool) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const labels: Record<string, string> = {};
  for (const pane of panes) {
    const custom = pane.title?.trim();
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

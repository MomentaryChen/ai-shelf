import {
  collectPanes,
  newSplitId,
  type LayoutNode,
  type PaneInfo,
  type SplitDirection,
} from "./split-tree";
import { clampSplitRatio } from "./split-resize";

/**
 * One-click layout presets: rearrange the panes already open into a fixed
 * shape. Panes are only moved — no pane is created or closed and every
 * PaneInfo object is reused, so ids, sessions, labels, focus and minimized
 * state keep working. Split ids are new.
 */

export const LAYOUT_PRESETS = ["columns", "rows", "grid", "main-side"] as const;

export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];

/** Left / right share of the focused pane in the "main + side" preset. */
export const MAIN_SIDE_RATIO = 0.6;

export function isLayoutPreset(value: unknown): value is LayoutPreset {
  return typeof value === "string" && (LAYOUT_PRESETS as readonly string[]).includes(value);
}

/**
 * Nodes laid out one after another along `direction`, all the same size
 * (left-nested chain, the `i`-th split gives its first side `i / (i + 1)`).
 */
function equalStrip(nodes: LayoutNode[], direction: SplitDirection): LayoutNode | null {
  if (nodes.length === 0) return null;
  let root = nodes[0]!;
  for (let i = 1; i < nodes.length; i++) {
    root = {
      kind: "split",
      id: newSplitId(),
      direction,
      ratio: i / (i + 1),
      first: root,
      second: nodes[i]!,
    };
  }
  return root;
}

const leaf = (pane: PaneInfo): LayoutNode => ({ kind: "pane", pane });

/**
 * Panes per grid row, top to bottom: as square as possible, with longer rows
 * first (4 → [2, 2], 5 → [3, 2], 6 → [3, 3], 7 → [3, 2, 2], 8 → [3, 3, 2]).
 */
export function gridRowSizes(count: number): number[] {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Rows of equal height, each row a strip of equal-width panes (see {@link gridRowSizes}). */
export function buildGridLayout(panes: PaneInfo[]): LayoutNode | null {
  const rows: LayoutNode[] = [];
  let at = 0;
  for (const size of gridRowSizes(panes.length)) {
    rows.push(equalStrip(panes.slice(at, at + size).map(leaf), "horizontal")!);
    at += size;
  }
  return equalStrip(rows, "vertical");
}

/**
 * Main pane on the left ({@link MAIN_SIDE_RATIO} of the width), the rest
 * stacked top to bottom on the right. `mainPaneId` falls back to the first pane.
 */
export function buildMainSideLayout(panes: PaneInfo[], mainPaneId: string | null): LayoutNode | null {
  if (panes.length === 0) return null;
  const main = panes.find((p) => p.id === mainPaneId) ?? panes[0]!;
  if (panes.length === 1) return leaf(main);
  const side = equalStrip(
    panes.filter((p) => p !== main).map(leaf),
    "vertical",
  )!;
  return {
    kind: "split",
    id: newSplitId(),
    direction: "horizontal",
    ratio: MAIN_SIDE_RATIO,
    first: leaf(main),
    second: side,
  };
}

/** `panes` (in order) arranged into `preset`; `focusedPaneId` is the main pane of "main-side". */
export function buildPresetLayout(
  panes: PaneInfo[],
  preset: LayoutPreset,
  focusedPaneId: string | null,
): LayoutNode | null {
  switch (preset) {
    case "columns":
      return equalStrip(panes.map(leaf), "horizontal");
    case "rows":
      return equalStrip(panes.map(leaf), "vertical");
    case "grid":
      return buildGridLayout(panes);
    case "main-side":
      return buildMainSideLayout(panes, focusedPaneId);
  }
}

export interface ApplyLayoutPresetOptions {
  /**
   * Panes kept in the tree but not on screen (minimized, popped out). They are
   * not arranged; they go into a side strip that the display filter drops, so
   * the shown tree is exactly the preset and restoring them later brings them
   * back on the right / bottom.
   */
  hiddenPaneIds?: ReadonlySet<string>;
  focusedPaneId?: string | null;
}

/**
 * Rearrange the visible panes of `root` into `preset` (visual / DFS order;
 * "main-side" puts the focused pane first). Returns `root` itself when fewer
 * than two panes are visible.
 */
export function applyLayoutPreset(
  root: LayoutNode,
  preset: LayoutPreset,
  options: ApplyLayoutPresetOptions = {},
): LayoutNode {
  const hidden = options.hiddenPaneIds ?? new Set<string>();
  const all = collectPanes(root);
  const visible = all.filter((p) => !hidden.has(p.id));
  if (visible.length < 2) return root;
  const arranged = buildPresetLayout(visible, preset, options.focusedPaneId ?? null);
  if (!arranged) return root;
  const rest = all.filter((p) => hidden.has(p.id));
  if (rest.length === 0) return arranged;

  // Columns / rows: the hidden panes continue the same strip, so restoring all
  // of them gives equal columns / rows again. Other presets: one extra column.
  const sameAxis = preset === "columns" || preset === "rows";
  const direction: SplitDirection = preset === "rows" ? "vertical" : "horizontal";
  const restTree = equalStrip(rest.map(leaf), sameAxis ? direction : "vertical")!;
  const columns = sameAxis
    ? visible.length
    : preset === "grid"
      ? (gridRowSizes(visible.length)[0] ?? 1)
      : 2;
  const restSlots = sameAxis ? rest.length : 1;
  return {
    kind: "split",
    id: newSplitId(),
    direction,
    ratio: clampSplitRatio(columns / (columns + restSlots)),
    first: arranged,
    second: restTree,
  };
}

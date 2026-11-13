import { buildHorizontalLayout, buildVerticalLayout } from "./layout-serialize";
import type { PaneDropZone } from "./pane-drop-zone";
import { reorderById } from "../utils/reorder-by-id";

export interface PaneInfo {
  id: string;
  tool: string;
  sessionId: string;
  cwd: string;
  /** User-defined tab label; falls back to tool name when empty. */
  title?: string;
  /** AI agent conversation id (Claude Code `--session-id`), resumed on restore. */
  agentSessionId?: string;
}

export type SplitDirection = "horizontal" | "vertical";

export type LayoutNode =
  | { kind: "pane"; pane: PaneInfo }
  | {
      kind: "split";
      id: string;
      direction: SplitDirection;
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

export function newSplitId(): string {
  return `split-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function collectPanes(node: LayoutNode | null): PaneInfo[] {
  if (!node) return [];
  if (node.kind === "pane") return [node.pane];
  return [...collectPanes(node.first), ...collectPanes(node.second)];
}

export function findPane(node: LayoutNode | null, paneId: string): PaneInfo | null {
  if (!node) return null;
  if (node.kind === "pane") return node.pane.id === paneId ? node.pane : null;
  return findPane(node.first, paneId) ?? findPane(node.second, paneId);
}

export function removePaneFromTree(root: LayoutNode | null, paneId: string): LayoutNode | null {
  if (!root) return null;

  if (root.kind === "pane") {
    return root.pane.id === paneId ? null : root;
  }

  const first = removePaneFromTree(root.first, paneId);
  const second = removePaneFromTree(root.second, paneId);

  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;

  return { ...root, first, second };
}

export function splitPaneInTree(
  root: LayoutNode,
  paneId: string,
  direction: SplitDirection,
  newPane: PaneInfo,
  ratio = 0.5,
): LayoutNode {
  if (root.kind === "pane") {
    if (root.pane.id !== paneId) return root;
    const split: LayoutNode = {
      kind: "split",
      id: newSplitId(),
      direction,
      ratio,
      first: root,
      second: { kind: "pane", pane: newPane },
    };
    return split;
  }

  return {
    ...root,
    first: splitPaneInTree(root.first, paneId, direction, newPane, ratio),
    second: splitPaneInTree(root.second, paneId, direction, newPane, ratio),
  };
}

/** Members of a same-direction run: nested splits along `direction` are flattened, anything else is one slot. */
function runSlotCount(node: LayoutNode, direction: SplitDirection): number {
  if (node.kind === "split" && node.direction === direction) {
    return runSlotCount(node.first, direction) + runSlotCount(node.second, direction);
  }
  return 1;
}

function equalizeRun(node: LayoutNode, direction: SplitDirection): LayoutNode {
  if (node.kind !== "split" || node.direction !== direction) return node;
  const first = runSlotCount(node.first, direction);
  const second = runSlotCount(node.second, direction);
  return {
    ...node,
    ratio: first / (first + second),
    first: equalizeRun(node.first, direction),
    second: equalizeRun(node.second, direction),
  };
}

function splitPathToPane(node: LayoutNode, paneId: string): Extract<LayoutNode, { kind: "split" }>[] | null {
  if (node.kind === "pane") return node.pane.id === paneId ? [] : null;
  for (const child of [node.first, node.second]) {
    const rest = splitPathToPane(child, paneId);
    if (rest) return [node, ...rest];
  }
  return null;
}

/**
 * Give every slot in the row/column that holds `paneId` the same size.
 * Only the run of same-direction splits directly around the pane changes;
 * ratios the user dragged elsewhere in the tree are kept.
 */
export function equalizeRunAroundPane(root: LayoutNode, paneId: string): LayoutNode {
  const path = splitPathToPane(root, paneId);
  if (!path || path.length === 0) return root;
  const direction = path[path.length - 1]!.direction;
  let top = path.length - 1;
  while (top > 0 && path[top - 1]!.direction === direction) top--;
  const runRootId = path[top]!.id;

  function walk(node: LayoutNode): LayoutNode {
    if (node.kind === "pane") return node;
    if (node.id === runRootId) return equalizeRun(node, direction);
    return { ...node, first: walk(node.first), second: walk(node.second) };
  }
  return walk(root);
}

export function mapPanesInTree(
  root: LayoutNode,
  fn: (pane: PaneInfo) => PaneInfo,
): LayoutNode {
  if (root.kind === "pane") {
    return { kind: "pane", pane: fn(root.pane) };
  }
  return {
    ...root,
    first: mapPanesInTree(root.first, fn),
    second: mapPanesInTree(root.second, fn),
  };
}

export function updateSplitRatio(
  root: LayoutNode,
  splitId: string,
  ratio: number,
): LayoutNode {
  const clamped = Math.min(0.9, Math.max(0.1, ratio));
  if (root.kind === "pane") return root;
  if (root.id === splitId) return { ...root, ratio: clamped };
  return {
    ...root,
    first: updateSplitRatio(root.first, splitId, clamped),
    second: updateSplitRatio(root.second, splitId, clamped),
  };
}

function isVerticalPaneChain(node: LayoutNode): boolean {
  if (node.kind === "pane") return true;
  if (node.direction !== "vertical") return false;
  return isVerticalPaneChain(node.first) && isVerticalPaneChain(node.second);
}

function isHorizontalPaneChain(node: LayoutNode): boolean {
  if (node.kind === "pane") return true;
  if (node.direction !== "horizontal") return false;
  return isHorizontalPaneChain(node.first) && isHorizontalPaneChain(node.second);
}

/** Dominant strip direction for reorder (vertical = top-to-bottom, horizontal = left-to-right). */
export function getLayoutStripDirection(root: LayoutNode): SplitDirection | null {
  if (isVerticalPaneChain(root)) return "vertical";
  if (isHorizontalPaneChain(root)) return "horizontal";
  if (root.kind === "split" && collectPanes(root).length > 1) return root.direction;
  return null;
}

function remapPanesToDfsOrder(root: LayoutNode, reordered: PaneInfo[]): LayoutNode {
  let i = 0;
  function walk(node: LayoutNode): LayoutNode {
    if (node.kind === "pane") {
      const pane = reordered[i++] ?? node.pane;
      return { kind: "pane", pane };
    }
    return {
      ...node,
      first: walk(node.first),
      second: walk(node.second),
    };
  }
  return walk(root);
}

/** Reorder panes to match tab order; keeps vertical stacks top-to-bottom, horizontal left-to-right. */
export function reorderPanesInTree(
  root: LayoutNode,
  dragPaneId: string,
  dropPaneId: string,
): LayoutNode {
  const panes = collectPanes(root);
  const reordered = reorderById(panes, dragPaneId, dropPaneId, (p) => p.id);
  if (!reordered) return root;
  if (reordered.length <= 1) return root;

  const direction = getLayoutStripDirection(root);
  if (direction === "vertical") {
    const built = buildVerticalLayout(reordered);
    if (built) return built;
  }
  if (direction === "horizontal") {
    const built = buildHorizontalLayout(reordered);
    if (built) return built;
  }
  return remapPanesToDfsOrder(root, reordered);
}

function replacePaneLeaf(
  root: LayoutNode,
  targetPaneId: string,
  build: (leaf: { kind: "pane"; pane: PaneInfo }) => LayoutNode,
): LayoutNode | null {
  if (root.kind === "pane") {
    return root.pane.id === targetPaneId ? build(root) : root;
  }
  const first = replacePaneLeaf(root.first, targetPaneId, build);
  const second = replacePaneLeaf(root.second, targetPaneId, build);
  if (!first || !second) return root;
  return { ...root, first, second };
}

function insertPaneRelative(
  root: LayoutNode,
  targetPaneId: string,
  pane: PaneInfo,
  zone: "above" | "below" | "left" | "right",
): LayoutNode | null {
  return replacePaneLeaf(root, targetPaneId, (leaf) => {
    switch (zone) {
      case "above":
        return {
          kind: "split",
          id: newSplitId(),
          direction: "vertical",
          ratio: 0.5,
          first: { kind: "pane", pane },
          second: leaf,
        };
      case "below":
        return {
          kind: "split",
          id: newSplitId(),
          direction: "vertical",
          ratio: 0.5,
          first: leaf,
          second: { kind: "pane", pane },
        };
      case "left":
        return {
          kind: "split",
          id: newSplitId(),
          direction: "horizontal",
          ratio: 0.5,
          first: { kind: "pane", pane },
          second: leaf,
        };
      case "right":
        return {
          kind: "split",
          id: newSplitId(),
          direction: "horizontal",
          ratio: 0.5,
          first: leaf,
          second: { kind: "pane", pane },
        };
    }
  });
}

function swapPanesInTree(root: LayoutNode, paneIdA: string, paneIdB: string): LayoutNode {
  const a = findPane(root, paneIdA);
  const b = findPane(root, paneIdB);
  if (!a || !b || paneIdA === paneIdB) return root;
  return mapPanesInTree(root, (p) => {
    if (p.id === paneIdA) return { ...b, id: p.id, sessionId: b.sessionId };
    if (p.id === paneIdB) return { ...a, id: p.id, sessionId: a.sessionId };
    return p;
  });
}

/** Move a pane onto a target using edge/center drop zones (works with complex multi-pane layouts). */
export function movePaneInTree(
  root: LayoutNode,
  dragPaneId: string,
  targetPaneId: string,
  zone: PaneDropZone,
): LayoutNode {
  if (dragPaneId === targetPaneId) return root;
  if (!findPane(root, targetPaneId)) return root;
  if (zone === "swap") return swapPanesInTree(root, dragPaneId, targetPaneId);

  const dragged = findPane(root, dragPaneId);
  if (!dragged) return root;

  let tree = removePaneFromTree(root, dragPaneId);
  if (!tree) return { kind: "pane", pane: dragged };

  const inserted = insertPaneRelative(tree, targetPaneId, dragged, zone);
  return inserted ?? root;
}

// ---------------------------------------------------------------------------
// Maximize (view-only: the tree itself is never changed)
// ---------------------------------------------------------------------------

/**
 * The pane to show maximized, or `null` for the normal split view.
 *
 * Maximize is view state kept outside the layout. It only applies while the
 * pane is still in the shown layout, is the focused pane, and has siblings, so
 * closing it, focusing another pane, or splitting (the new pane takes focus)
 * restores the split view without any extra bookkeeping.
 */
export function effectiveMaximizedPaneId(
  root: LayoutNode | null,
  maximizedPaneId: string | null,
  focusedPaneId: string | null,
): string | null {
  if (!root || !maximizedPaneId || root.kind === "pane") return null;
  if (maximizedPaneId !== focusedPaneId) return null;
  return findPane(root, maximizedPaneId) ? maximizedPaneId : null;
}

/** Which side of `split` holds the maximized pane (the other side is hidden). */
export function maximizedSplitSide(
  split: LayoutNode,
  maximizedPaneId: string | null,
): "first" | "second" | null {
  if (!maximizedPaneId || split.kind !== "split") return null;
  if (findPane(split.first, maximizedPaneId)) return "first";
  if (findPane(split.second, maximizedPaneId)) return "second";
  return null;
}

/** Toggle target: restore when `paneId` is already maximized, otherwise maximize it. */
export function toggleMaximizedPaneId(
  root: LayoutNode | null,
  maximizedPaneId: string | null,
  paneId: string,
): string | null {
  const current = effectiveMaximizedPaneId(root, maximizedPaneId, paneId);
  if (current === paneId) return null;
  return effectiveMaximizedPaneId(root, paneId, paneId);
}

// ---------------------------------------------------------------------------
// Keyboard pane management (swap / resize / equalize)
// ---------------------------------------------------------------------------

export type PaneDirection = "left" | "right" | "up" | "down";

/** Pane rectangle in a unit square (x, y = top-left). */
export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each pane's rectangle: horizontal splits put `first` left, vertical splits put `first` on top. */
export function paneRects(root: LayoutNode): Map<string, PaneRect> {
  const out = new Map<string, PaneRect>();
  function walk(node: LayoutNode, r: PaneRect) {
    if (node.kind === "pane") {
      out.set(node.pane.id, r);
      return;
    }
    if (node.direction === "horizontal") {
      const w1 = r.w * node.ratio;
      walk(node.first, { x: r.x, y: r.y, w: w1, h: r.h });
      walk(node.second, { x: r.x + w1, y: r.y, w: r.w - w1, h: r.h });
    } else {
      const h1 = r.h * node.ratio;
      walk(node.first, { x: r.x, y: r.y, w: r.w, h: h1 });
      walk(node.second, { x: r.x, y: r.y + h1, w: r.w, h: r.h - h1 });
    }
  }
  walk(root, { x: 0, y: 0, w: 1, h: 1 });
  return out;
}

const EPS = 1e-6;

/**
 * Nearest pane on the given side of `paneId`: it must touch that edge and
 * overlap along the other axis. Ties go to the larger overlap, then the
 * closest centre. Null when there is none.
 */
export function findPaneInDirection(
  root: LayoutNode,
  paneId: string,
  direction: PaneDirection,
): string | null {
  const rects = paneRects(root);
  const from = rects.get(paneId);
  if (!from) return null;
  const horizontal = direction === "left" || direction === "right";
  let best: { id: string; gap: number; overlap: number; centre: number } | null = null;
  for (const [id, r] of rects) {
    if (id === paneId) continue;
    let gap: number;
    switch (direction) {
      case "right":
        gap = r.x - (from.x + from.w);
        break;
      case "left":
        gap = from.x - (r.x + r.w);
        break;
      case "down":
        gap = r.y - (from.y + from.h);
        break;
      case "up":
        gap = from.y - (r.y + r.h);
        break;
    }
    if (gap < -EPS) continue;
    const [a0, a1, b0, b1] = horizontal
      ? [from.y, from.y + from.h, r.y, r.y + r.h]
      : [from.x, from.x + from.w, r.x, r.x + r.w];
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= EPS) continue;
    const centre = Math.abs((a0 + a1) / 2 - (b0 + b1) / 2);
    if (
      !best ||
      gap < best.gap - EPS ||
      (Math.abs(gap - best.gap) <= EPS &&
        (overlap > best.overlap + EPS ||
          // Equal centres keep the earlier (top / left) pane.
          (Math.abs(overlap - best.overlap) <= EPS && centre < best.centre - EPS)))
    ) {
      best = { id, gap, overlap, centre };
    }
  }
  return best?.id ?? null;
}

/** Exchange two panes' positions; each PaneInfo (id, session, title) moves whole, so focus follows. */
export function swapPaneLeaves(root: LayoutNode, paneIdA: string, paneIdB: string): LayoutNode {
  if (paneIdA === paneIdB) return root;
  const a = findPane(root, paneIdA);
  const b = findPane(root, paneIdB);
  if (!a || !b) return root;
  return mapPanesInTree(root, (p) => (p.id === paneIdA ? b : p.id === paneIdB ? a : p));
}

/** Every split sized so each pane in a row / column gets the same share. */
export function equalizeAllSplits(root: LayoutNode): LayoutNode {
  if (root.kind === "pane") return root;
  const first = runSlotCount(root.first, root.direction);
  const second = runSlotCount(root.second, root.direction);
  return {
    ...root,
    ratio: first / (first + second),
    first: equalizeAllSplits(root.first),
    second: equalizeAllSplits(root.second),
  };
}

/**
 * Move the divider nearest to `paneId` along the direction's axis by `step`
 * (right / down → ratio grows). Returns `root` itself when nothing changes.
 */
export function resizePaneInDirection(
  root: LayoutNode,
  paneId: string,
  direction: PaneDirection,
  step = 0.05,
): LayoutNode {
  const path = splitPathToPane(root, paneId);
  if (!path) return root;
  const axis: SplitDirection = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  let split: Extract<LayoutNode, { kind: "split" }> | undefined;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i]!.direction === axis) {
      split = path[i];
      break;
    }
  }
  if (!split) return root;
  const delta = direction === "right" || direction === "down" ? step : -step;
  const ratio = Math.min(0.9, Math.max(0.1, split.ratio + delta));
  if (Math.abs(ratio - split.ratio) < EPS) return root;
  return updateSplitRatio(root, split.id, ratio);
}

/**
 * Copy split ratios from `source` onto splits with the same id in `target`
 * (apply a change computed on the display tree to the full layout).
 */
export function copySplitRatios(target: LayoutNode, source: LayoutNode): LayoutNode {
  const ratios = new Map<string, number>();
  (function collect(node: LayoutNode) {
    if (node.kind === "pane") return;
    ratios.set(node.id, node.ratio);
    collect(node.first);
    collect(node.second);
  })(source);
  let changed = false;
  function walk(node: LayoutNode): LayoutNode {
    if (node.kind === "pane") return node;
    const first = walk(node.first);
    const second = walk(node.second);
    const r = ratios.get(node.id);
    const ratio = r === undefined ? node.ratio : r;
    if (ratio === node.ratio && first === node.first && second === node.second) return node;
    changed = true;
    return { ...node, ratio, first, second };
  }
  const out = walk(target);
  return changed ? out : target;
}

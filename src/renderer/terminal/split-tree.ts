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

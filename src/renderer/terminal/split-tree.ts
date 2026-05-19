export interface PaneInfo {
  id: string;
  tool: string;
  sessionId: string;
  cwd: string;
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

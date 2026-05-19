import type { LayoutNode, PaneInfo, SplitDirection } from "./split-tree";
import { newSplitId } from "./split-tree";

export interface SavedPaneSlot {
  tool: string;
  cwd: string;
}

export type SerializedLayoutNode =
  | { kind: "pane"; index: number }
  | {
      kind: "split";
      id: string;
      direction: SplitDirection;
      ratio: number;
      first: SerializedLayoutNode;
      second: SerializedLayoutNode;
    };

export function serializeLayout(root: LayoutNode): {
  layout: SerializedLayoutNode;
  panes: SavedPaneSlot[];
} {
  const panes: SavedPaneSlot[] = [];

  function walk(node: LayoutNode): SerializedLayoutNode {
    if (node.kind === "pane") {
      const index = panes.length;
      panes.push({ tool: node.pane.tool, cwd: node.pane.cwd });
      return { kind: "pane", index };
    }
    return {
      kind: "split",
      id: node.id,
      direction: node.direction,
      ratio: node.ratio,
      first: walk(node.first),
      second: walk(node.second),
    };
  }

  return { layout: walk(root), panes };
}

export function deserializeLayout(
  serialized: SerializedLayoutNode,
  panes: PaneInfo[],
): LayoutNode | null {
  function build(node: SerializedLayoutNode): LayoutNode | null {
    if (node.kind === "pane") {
      const pane = panes[node.index];
      return pane ? { kind: "pane", pane } : null;
    }
    const first = build(node.first);
    const second = build(node.second);
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    const ratio = Math.min(0.9, Math.max(0.1, node.ratio));
    return {
      kind: "split",
      id: node.id || newSplitId(),
      direction: node.direction,
      ratio,
      first,
      second,
    };
  }
  return build(serialized);
}

/** Build a simple horizontal strip when no layout tree was saved. */
export function buildHorizontalLayout(panes: PaneInfo[]): LayoutNode | null {
  if (panes.length === 0) return null;
  if (panes.length === 1) return { kind: "pane", pane: panes[0]! };
  let root: LayoutNode = { kind: "pane", pane: panes[0]! };
  for (let i = 1; i < panes.length; i++) {
    root = {
      kind: "split",
      id: newSplitId(),
      direction: "horizontal",
      ratio: i / (i + 1),
      first: root,
      second: { kind: "pane", pane: panes[i]! },
    };
  }
  return root;
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { removePaneFromTree, type LayoutNode, type PaneInfo } from "./split-tree.js";
import {
  closedPaneEntry,
  countClosedPanes,
  peekClosedPane,
  pushClosedPane,
  recordPanePosition,
  reinsertClosedPane,
  remapClosedPaneAnchor,
  removeClosedPane,
  type ClosedPaneEntry,
  type ClosedPaneStacks,
} from "./closed-panes.js";

function pane(id: string, extra: Partial<PaneInfo> = {}): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd: "/tmp", ...extra };
}

function leaf(id: string): LayoutNode {
  return { kind: "pane", pane: pane(id) };
}

/** Compact shape: ids and directions only (h = horizontal, v = vertical). */
function shape(node: LayoutNode): string {
  if (node.kind === "pane") return node.pane.id;
  return `${node.direction === "horizontal" ? "h" : "v"}(${shape(node.first)},${shape(node.second)})`;
}

// [a | [b / c]] with a 30/70 root split
const tree: LayoutNode = {
  kind: "split",
  id: "root",
  direction: "horizontal",
  ratio: 0.3,
  first: leaf("a"),
  second: {
    kind: "split",
    id: "right",
    direction: "vertical",
    ratio: 0.6,
    first: leaf("b"),
    second: leaf("c"),
  },
};

function closeAndReopen(root: LayoutNode, paneId: string, newId = `${paneId}2`): LayoutNode {
  const pos = recordPanePosition(root, paneId);
  const rest = removePaneFromTree(root, paneId);
  return reinsertClosedPane(rest, pane(newId), pos, null).layout;
}

describe("recordPanePosition", () => {
  it("records the leaf next to the pane, the side and the ratio", () => {
    assert.deepEqual(recordPanePosition(tree, "b"), {
      anchorPaneId: "c",
      parentSplitId: "right",
      zone: "above",
      ratio: 0.6,
    });
    assert.deepEqual(recordPanePosition(tree, "a"), {
      anchorPaneId: "b",
      siblingSplitId: "right",
      parentSplitId: "root",
      zone: "left",
      ratio: 0.3,
    });
  });

  it("is null for a lone or missing pane", () => {
    assert.equal(recordPanePosition(leaf("a"), "a"), null);
    assert.equal(recordPanePosition(tree, "zz"), null);
    assert.equal(recordPanePosition(null, "a"), null);
  });
});

describe("reinsertClosedPane", () => {
  it("restores a leaf beside its old neighbour with the old ratio", () => {
    const back = closeAndReopen(tree, "c");
    assert.equal(shape(back), "h(a,v(b,c2))");
    assert.equal(back.kind === "split" && back.second.kind === "split" && back.second.ratio, 0.6);
    assert.equal(back.kind === "split" && back.second.kind === "split" && back.second.id, "right");
  });

  it("re-wraps a whole sibling subtree", () => {
    const back = closeAndReopen(tree, "a");
    assert.equal(shape(back), "h(a2,v(b,c))");
    assert.equal(back.kind === "split" && back.ratio, 0.3);
  });

  it("restores several closes in reverse order (anchors remapped)", () => {
    let stacks: ClosedPaneStacks = {};
    let root: LayoutNode | null = tree;
    for (const id of ["c", "b"]) {
      stacks = pushClosedPane(stacks, "p", closedPaneEntry(pane(id), root, null, 1));
      root = removePaneFromTree(root, id);
    }
    assert.equal(shape(root!), "a");
    for (const _ of [1, 2]) {
      const entry = peekClosedPane(stacks, "p", null)!;
      const newId = `${entry.paneId}2`;
      root = reinsertClosedPane(root, pane(newId), entry.position, null).layout;
      stacks = removeClosedPane(stacks, "p", entry);
      stacks = remapClosedPaneAnchor(stacks, "p", entry.paneId, newId);
    }
    assert.equal(shape(root!), "h(a,v(b2,c2))");
    assert.deepEqual(stacks, {});
  });

  it("falls back to splitting the focused pane when the neighbour is gone", () => {
    const pos = recordPanePosition(tree, "b");
    const rest = removePaneFromTree(removePaneFromTree(tree, "b"), "c");
    const r = reinsertClosedPane(rest, pane("b2"), pos, "a");
    assert.equal(r.restored, false);
    assert.equal(r.anchorPaneId, "a");
    assert.equal(shape(r.layout), "h(a,b2)");
  });

  it("falls back to the last pane without a focused one, and to a lone leaf on an empty layout", () => {
    assert.equal(shape(reinsertClosedPane(tree, pane("n"), null, "zz").layout), "h(a,v(b,h(c,n)))");
    assert.equal(shape(reinsertClosedPane(null, pane("n"), null, null).layout), "n");
  });

  it("does not reuse a split id that is still in the tree", () => {
    const pos = recordPanePosition(tree, "c")!;
    const back = reinsertClosedPane(tree, pane("n"), pos, null).layout;
    const ids: string[] = [];
    const walk = (n: LayoutNode) => {
      if (n.kind === "split") {
        ids.push(n.id);
        walk(n.first);
        walk(n.second);
      }
    };
    walk(back);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("closed pane stacks", () => {
  const entry = (paneId: string, viewId: string | null = null): ClosedPaneEntry => ({
    paneId,
    tool: "claude",
    cwd: "/w",
    viewId,
    position: null,
    closedAt: 0,
  });

  it("keeps what is needed to start the pane again", () => {
    const e = closedPaneEntry(
      pane("b", { tool: "claude", title: "Review", agentSessionId: "sid", taskId: "t1", autoTitle: "x" }),
      tree,
      "view-1",
      5,
    );
    assert.equal(e.tool, "claude");
    assert.equal(e.title, "Review");
    assert.equal(e.agentSessionId, "sid");
    assert.equal(e.taskId, "t1");
    assert.equal(e.viewId, "view-1");
    assert.equal(e.closedAt, 5);
    assert.equal(e.position?.anchorPaneId, "c");
    assert.equal("autoTitle" in e, false);
  });

  it("caps each (profile, view) bucket and pops newest first", () => {
    let s: ClosedPaneStacks = {};
    for (let i = 0; i < 5; i++) s = pushClosedPane(s, "p", entry(`m${i}`), 3);
    s = pushClosedPane(s, "p", entry("v0", "view-1"), 3);
    s = pushClosedPane(s, "q", entry("q0"), 3);
    assert.equal(countClosedPanes(s, "p", null, new Set(["view-1"])), 3);
    assert.equal(peekClosedPane(s, "p", null, new Set(["view-1"]))?.paneId, "m4");
    assert.equal(peekClosedPane(s, "p", "view-1")?.paneId, "v0");
    assert.equal(countClosedPanes(s, "p", "view-1"), 1);
    assert.equal(peekClosedPane(s, "q", null)?.paneId, "q0");
    assert.equal(peekClosedPane(s, null, null), null);
  });

  it("lets the origin window take entries of a view that is gone", () => {
    let s: ClosedPaneStacks = pushClosedPane({}, "p", entry("m0"), 3);
    s = pushClosedPane(s, "p", entry("v0", "view-1"), 3);
    assert.equal(peekClosedPane(s, "p", null, new Set(["view-1"]))?.paneId, "m0");
    assert.equal(peekClosedPane(s, "p", null, new Set())?.paneId, "v0");
    assert.equal(countClosedPanes(s, "p", null), 2);
  });

  it("removes one entry and drops empty profiles", () => {
    const e = entry("a");
    const s = pushClosedPane({}, "p", e);
    assert.deepEqual(removeClosedPane(s, "p", e), {});
    assert.equal(removeClosedPane(s, "p", entry("a")), s);
  });
});

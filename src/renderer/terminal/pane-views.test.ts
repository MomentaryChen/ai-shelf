import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectPanes, findPane, type LayoutNode, type PaneInfo } from "./split-tree.js";
import {
  addPaneToView,
  deserializeViews,
  findViewOfPane,
  hiddenPaneIds,
  placePaneInView,
  removePaneFromViews,
  resolveViews,
  serializeViews,
  type PaneView,
} from "./pane-views.js";

function pane(id: string, cwd = "/w"): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd };
}

function leaf(p: PaneInfo): LayoutNode {
  return { kind: "pane", pane: p };
}

const a = pane("a");
const b = pane("b");
const c = pane("c");
const d = pane("d");

// Profile layout: [a | b] / [c | d]
const profileTree: LayoutNode = {
  kind: "split",
  id: "root",
  direction: "vertical",
  ratio: 0.5,
  first: { kind: "split", id: "top", direction: "horizontal", ratio: 0.5, first: leaf(a), second: leaf(b) },
  second: { kind: "split", id: "bot", direction: "horizontal", ratio: 0.5, first: leaf(c), second: leaf(d) },
};

function view(id: string, profileKey: string, panes: PaneInfo[]): PaneView {
  let v: PaneView = { id, profileKey, layout: leaf(panes[0]!), focusedPaneId: panes[0]!.id, bounds: null };
  for (const p of panes.slice(1)) v = addPaneToView(v, p);
  return v;
}

const ids = (node: LayoutNode | null) => collectPanes(node).map((p) => p.id);

describe("hiddenPaneIds / findViewOfPane", () => {
  it("collects panes in views of the given profile only", () => {
    const views = [view("v1", "w:a", [b, d]), view("v2", "w:b", [pane("x")])];
    assert.deepEqual([...hiddenPaneIds(views, "w:a")].sort(), ["b", "d"]);
    assert.equal(hiddenPaneIds(views, null).size, 0);
    assert.equal(findViewOfPane(views, "x")?.id, "v2");
    assert.equal(findViewOfPane(views, "a"), null);
  });
});

describe("addPaneToView", () => {
  it("adds beside the focused pane, equal widths, and focuses it", () => {
    const v = addPaneToView(view("v", "w:a", [a]), b);
    assert.deepEqual(ids(v.layout), ["a", "b"]);
    assert.equal(v.focusedPaneId, "b");
    assert.equal(v.layout.kind === "split" && v.layout.ratio, 0.5);
  });

  it("does not duplicate a pane already in the view", () => {
    const v = addPaneToView(view("v", "w:a", [a, b]), a);
    assert.deepEqual(ids(v.layout), ["a", "b"]);
    assert.equal(v.focusedPaneId, "a");
  });
});

describe("removePaneFromViews", () => {
  it("removes the pane and keeps the rest of the view", () => {
    const views = [view("v", "w:a", [a, b])];
    const next = removePaneFromViews(views, "b");
    assert.deepEqual(ids(next[0]!.layout), ["a"]);
  });

  it("drops a view that becomes empty", () => {
    assert.deepEqual(removePaneFromViews([view("v", "w:a", [a])], "a"), []);
  });

  it("returns the same array when the pane is in no view", () => {
    const views = [view("v", "w:a", [a])];
    assert.equal(removePaneFromViews(views, "zzz"), views);
  });
});

describe("resolveViews", () => {
  it("is stable when nothing changed", () => {
    const views = [view("v", "w:a", [a, b])];
    const lookup = (_k: string, id: string) => findPane(profileTree, id);
    assert.equal(resolveViews(views, lookup), views);
  });

  it("picks up new pane info (restart → new session) by id", () => {
    const views = [view("v", "w:a", [a])];
    const restarted = { ...a, sessionId: "s-a2" };
    const next = resolveViews(views, (_k, id) => (id === "a" ? restarted : null));
    assert.equal(collectPanes(next[0]!.layout)[0]!.sessionId, "s-a2");
  });

  it("drops panes closed in the profile and empty views", () => {
    const views = [view("v1", "w:a", [a, b]), view("v2", "w:a", [c])];
    const next = resolveViews(views, (_k, id) => (id === "a" ? a : null));
    assert.equal(next.length, 1);
    assert.deepEqual(ids(next[0]!.layout), ["a"]);
    assert.equal(next[0]!.focusedPaneId, "a");
  });
});

describe("serializeViews / deserializeViews", () => {
  it("round-trips a view through saved slot indices", () => {
    const v = { ...view("v", "w:a", [d, b]), bounds: { x: 2000, y: 50, width: 900, height: 600 } };
    const saved = serializeViews([v], profileTree);
    // d is slot 3, b is slot 1 in the profile's DFS order.
    assert.deepEqual(
      collectIndices(saved[0]!.layout),
      [3, 1],
    );
    const slotPanes = [pane("A"), pane("B"), pane("C"), pane("D")];
    const restored = deserializeViews(saved, slotPanes, "w:a", () => "new");
    assert.equal(restored.length, 1);
    assert.deepEqual(ids(restored[0]!.layout), ["D", "B"]);
    assert.deepEqual(restored[0]!.bounds, { x: 2000, y: 50, width: 900, height: 600 });
    assert.equal(restored[0]!.profileKey, "w:a");
  });

  it("leaves out slots that failed to restore and drops empty views", () => {
    const saved = serializeViews([view("v1", "w:a", [b, c]), view("v2", "w:a", [d])], profileTree);
    const restored = deserializeViews(saved, [pane("A"), null, pane("C"), null], "w:a");
    assert.equal(restored.length, 1);
    assert.deepEqual(ids(restored[0]!.layout), ["C"]);
  });

  it("never puts one pane in two views", () => {
    const saved = [
      { layout: { kind: "pane", index: 0 }, bounds: null },
      { layout: { kind: "pane", index: 0 }, bounds: null },
    ];
    assert.equal(deserializeViews(saved, [pane("A")], "w:a").length, 1);
  });

  it("ignores junk", () => {
    const junk = [null, 3, { layout: { kind: "pane", index: 9 } }, { layout: { kind: "x" } }];
    assert.deepEqual(deserializeViews(junk, [pane("A")], "w:a"), []);
  });

  it("skips panes no longer in the profile when saving", () => {
    const saved = serializeViews([view("v", "w:a", [pane("gone")])], profileTree);
    assert.deepEqual(saved, []);
  });
});

function collectIndices(node: unknown): number[] {
  const n = node as { kind: string; index?: number; first?: unknown; second?: unknown };
  if (n.kind === "pane") return [n.index!];
  return [...collectIndices(n.first), ...collectIndices(n.second)];
}

describe("placePaneInView", () => {
  it("adds a pane on the dropped side of the target and focuses it", () => {
    const v = view("v1", "ws:p", [a, b]);
    assert.deepEqual(ids(placePaneInView(v, c, "a", "left").layout), ["c", "a", "b"]);
    assert.deepEqual(ids(placePaneInView(v, c, "a", "right").layout), ["a", "c", "b"]);
    assert.equal(placePaneInView(v, c, "a", "below").focusedPaneId, "c");
  });

  it("treats the centre zone on a new pane as beside the target", () => {
    const v = view("v1", "ws:p", [a, b]);
    assert.deepEqual(ids(placePaneInView(v, c, "b", "swap").layout), ["a", "b", "c"]);
  });

  it("moves a pane that is already in the view", () => {
    const v = view("v1", "ws:p", [a, b, c]);
    const moved = placePaneInView(v, c, "a", "left");
    assert.deepEqual(ids(moved.layout), ["c", "a", "b"]);
    assert.equal(moved.focusedPaneId, "c");
  });

  it("falls back to adding beside the focused pane when the target is gone", () => {
    const v = view("v1", "ws:p", [a]);
    assert.deepEqual(ids(placePaneInView(v, b, "zzz", "left").layout), ["a", "b"]);
    assert.equal(placePaneInView(v, a, "a", "left"), v);
  });
});

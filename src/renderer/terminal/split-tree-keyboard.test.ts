import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPanes,
  copySplitRatios,
  equalizeAllSplits,
  findPaneInDirection,
  paneRects,
  resizePaneInDirection,
  swapPaneLeaves,
  type LayoutNode,
  type PaneInfo,
  type SplitDirection,
} from "./split-tree.js";
import { deserializeLayout, serializeLayout } from "./layout-serialize.js";
import { buildDisplayLayout } from "./profile-pane-display.js";

function pane(id: string): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd: `/w/${id}` };
}
const leaf = (id: string): LayoutNode => ({ kind: "pane", pane: pane(id) });
const split = (
  id: string,
  direction: SplitDirection,
  ratio: number,
  first: LayoutNode,
  second: LayoutNode,
): LayoutNode => ({ kind: "split", id, direction, ratio, first, second });

/**
 * ┌───┬───┐
 * │ a │ b │
 * │   ├───┤
 * │   │ c │
 * ├───┴───┤
 * │   d   │
 * └───────┘
 */
const grid = (): LayoutNode =>
  split(
    "outer",
    "vertical",
    0.6,
    split("row", "horizontal", 0.5, leaf("a"), split("col", "vertical", 0.5, leaf("b"), leaf("c"))),
    leaf("d"),
  );

function ratioOf(node: LayoutNode, id: string): number | null {
  if (node.kind === "pane") return null;
  if (node.id === id) return node.ratio;
  return ratioOf(node.first, id) ?? ratioOf(node.second, id);
}

describe("paneRects", () => {
  it("lays out horizontal splits left→right and vertical splits top→bottom", () => {
    const r = paneRects(grid());
    assert.deepEqual(r.get("a"), { x: 0, y: 0, w: 0.5, h: 0.6 });
    assert.deepEqual(r.get("b"), { x: 0.5, y: 0, w: 0.5, h: 0.3 });
    assert.ok(Math.abs(r.get("c")!.y - 0.3) < 1e-9);
    assert.ok(Math.abs(r.get("d")!.y - 0.6) < 1e-9);
  });
});

describe("findPaneInDirection", () => {
  it("finds adjacent panes that overlap on the other axis", () => {
    const root = grid();
    assert.equal(findPaneInDirection(root, "a", "right"), "b");
    assert.equal(findPaneInDirection(root, "c", "left"), "a");
    assert.equal(findPaneInDirection(root, "b", "down"), "c");
    assert.equal(findPaneInDirection(root, "c", "down"), "d");
    assert.equal(findPaneInDirection(root, "a", "down"), "d");
    assert.equal(findPaneInDirection(root, "c", "up"), "b");
  });

  it("returns null at the edge or for unknown panes", () => {
    const root = grid();
    assert.equal(findPaneInDirection(root, "a", "left"), null);
    assert.equal(findPaneInDirection(root, "d", "down"), null);
    assert.equal(findPaneInDirection(root, "zz", "up"), null);
  });

  it("prefers the larger overlap when several panes touch the edge", () => {
    // d spans the full width; going up from d, a overlaps 0.5 and b/c overlap 0.5 each — tie → closest centre.
    const root = split(
      "outer",
      "vertical",
      0.5,
      split("row", "horizontal", 0.7, leaf("a"), leaf("b")),
      leaf("d"),
    );
    assert.equal(findPaneInDirection(root, "d", "up"), "a");
  });
});

describe("swapPaneLeaves", () => {
  it("moves whole panes so ids and sessions travel together", () => {
    const next = swapPaneLeaves(grid(), "a", "c");
    assert.deepEqual(
      collectPanes(next).map((p) => [p.id, p.sessionId]),
      [
        ["c", "s-c"],
        ["b", "s-b"],
        ["a", "s-a"],
        ["d", "s-d"],
      ],
    );
    assert.equal(ratioOf(next, "outer"), 0.6);
  });

  it("is a no-op for the same or an unknown pane", () => {
    const root = grid();
    assert.equal(swapPaneLeaves(root, "a", "a"), root);
    assert.equal(swapPaneLeaves(root, "a", "zz"), root);
  });
});

describe("equalizeAllSplits", () => {
  it("gives each slot of a row / column the same share", () => {
    const root = split(
      "row",
      "horizontal",
      0.8,
      leaf("a"),
      split("row2", "horizontal", 0.2, leaf("b"), leaf("c")),
    );
    const next = equalizeAllSplits(root);
    assert.ok(Math.abs(ratioOf(next, "row")! - 1 / 3) < 1e-9);
    assert.equal(ratioOf(next, "row2"), 0.5);
  });

  it("treats a perpendicular subtree as one slot", () => {
    const next = equalizeAllSplits(grid());
    assert.equal(ratioOf(next, "outer"), 0.5);
    assert.equal(ratioOf(next, "row"), 0.5);
    assert.equal(ratioOf(next, "col"), 0.5);
  });
});

describe("resizePaneInDirection", () => {
  it("moves the nearest divider on the matching axis", () => {
    const root = grid();
    assert.equal(ratioOf(resizePaneInDirection(root, "b", "right", 0.1), "row"), 0.6);
    assert.equal(ratioOf(resizePaneInDirection(root, "b", "left", 0.1), "row"), 0.4);
    // b's nearest vertical divider is the b/c one, not the outer one.
    assert.equal(ratioOf(resizePaneInDirection(root, "b", "down", 0.1), "col"), 0.6);
    assert.ok(Math.abs(ratioOf(resizePaneInDirection(root, "a", "up", 0.1), "outer")! - 0.5) < 1e-9);
  });

  it("returns the same tree when there is no divider or it is at the limit", () => {
    const root = grid();
    assert.equal(resizePaneInDirection(root, "d", "left"), root);
    const atMax = split("row", "horizontal", 0.9, leaf("a"), leaf("b"));
    assert.equal(resizePaneInDirection(atMax, "a", "right"), atMax);
    assert.equal(resizePaneInDirection(leaf("a"), "a", "right").kind, "pane");
  });
});

describe("copySplitRatios", () => {
  it("applies ratios from a display tree onto the full layout by split id", () => {
    const full = grid();
    // Display tree without d (minimized): `outer` is gone, `row` / `col` remain.
    const display = split("row", "horizontal", 0.5, leaf("a"), split("col", "vertical", 0.5, leaf("b"), leaf("c")));
    const next = copySplitRatios(full, equalizeAllSplits(resizePaneInDirection(display, "a", "right", 0.2)));
    assert.equal(ratioOf(next, "row"), 0.5);
    const resized = copySplitRatios(full, resizePaneInDirection(display, "a", "right", 0.2));
    assert.ok(Math.abs(ratioOf(resized, "row")! - 0.7) < 1e-9);
    assert.equal(ratioOf(resized, "outer"), 0.6);
    assert.equal(copySplitRatios(full, display), full);
  });
});

describe("display tree → layout (minimized panes)", () => {
  it("buildDisplayLayout keeps split ids, so ratios computed on it land in the layout", () => {
    const full = grid();
    const display = buildDisplayLayout(full, new Set(["c"]), "a")!;
    const next = copySplitRatios(full, resizePaneInDirection(display, "a", "right", 0.1));
    assert.ok(Math.abs(ratioOf(next, "row")! - 0.6) < 1e-9);
    assert.equal(ratioOf(next, "col"), 0.5);
  });
});

describe("keyboard pane changes persist through layout serialization", () => {
  it("round-trips swap, equalize and resize", () => {
    let root = grid();
    root = swapPaneLeaves(root, "a", "d");
    root = equalizeAllSplits(root);
    root = resizePaneInDirection(root, "b", "right", 0.1);
    const { layout, panes } = serializeLayout(root);
    const restored = deserializeLayout(
      layout,
      panes.map((slot, i) => ({ ...pane(`r${i}`), cwd: slot.cwd })),
    )!;
    assert.deepEqual(
      collectPanes(restored).map((p) => p.cwd),
      collectPanes(root).map((p) => p.cwd),
    );
    for (const id of ["outer", "row", "col"]) {
      assert.ok(Math.abs(ratioOf(restored, id)! - ratioOf(root, id)!) < 1e-9, id);
    }
  });
});

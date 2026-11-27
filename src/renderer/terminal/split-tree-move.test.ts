import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPanes,
  findPane,
  movePaneInTree,
  paneRects,
  swapPaneLeaves,
  type LayoutNode,
  type PaneInfo,
} from "./split-tree.js";

function pane(id: string): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd: "/tmp", title: `t-${id}` };
}

const leaf = (id: string): LayoutNode => ({ kind: "pane", pane: pane(id) });

function split(
  id: string,
  direction: "horizontal" | "vertical",
  ratio: number,
  first: LayoutNode,
  second: LayoutNode,
): LayoutNode {
  return { kind: "split", id, direction, ratio, first, second };
}

/** a | b | c, equal columns. */
function row3(): LayoutNode {
  return split("r1", "horizontal", 1 / 3, leaf("a"), split("r2", "horizontal", 0.5, leaf("b"), leaf("c")));
}

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
}

describe("movePaneInTree swap zone", () => {
  it("moves whole PaneInfo like swapPaneLeaves (id stays with its session)", () => {
    const root = row3();
    const next = movePaneInTree(root, "a", "c", "swap");
    assert.deepEqual(next, swapPaneLeaves(root, "a", "c"));
    assert.deepEqual(
      collectPanes(next).map((p) => p.id),
      ["c", "b", "a"],
    );
    for (const id of ["a", "b", "c"]) assert.deepEqual(findPane(next, id), pane(id));
    const rects = paneRects(next);
    assertClose(rects.get("a")!.x, 2 / 3, "a.x");
    assertClose(rects.get("c")!.x, 0, "c.x");
  });

  it("is a no-op for the same pane or an unknown pane", () => {
    const root = row3();
    assert.equal(movePaneInTree(root, "a", "a", "swap"), root);
    assert.equal(movePaneInTree(root, "a", "zz", "swap"), root);
    assert.equal(movePaneInTree(root, "zz", "a", "swap"), root);
  });
});

describe("movePaneInTree edge zones", () => {
  it("dropping into a row of 3 gives equal columns", () => {
    // (a | b | c) on top, d below; drag d to the right of c → 4 equal columns.
    const root = split("v", "vertical", 0.5, row3(), leaf("d"));
    const next = movePaneInTree(root, "d", "c", "right");
    const rects = paneRects(next);
    assert.deepEqual(
      collectPanes(next).map((p) => p.id),
      ["a", "b", "c", "d"],
    );
    for (const id of ["a", "b", "c", "d"]) {
      assertClose(rects.get(id)!.w, 1 / 4, `${id}.w`);
      assertClose(rects.get(id)!.h, 1, `${id}.h`);
    }
  });

  it("dropping beside a pane in a column of 2 gives equal rows", () => {
    // a | (b / c): drag a below c → b / c / a, each a third tall.
    const root = split("h", "horizontal", 0.5, leaf("a"), split("v", "vertical", 0.5, leaf("b"), leaf("c")));
    const next = movePaneInTree(root, "a", "c", "below");
    const rects = paneRects(next);
    for (const id of ["b", "c", "a"]) {
      assertClose(rects.get(id)!.h, 1 / 3, `${id}.h`);
      assertClose(rects.get(id)!.w, 1, `${id}.w`);
    }
  });

  it("re-equalizes the row the pane left", () => {
    // a | b | c on top of d; drag b below d → a | c share the top row 50/50,
    // and the column (top row, d, b) is split in thirds like the split buttons do.
    const root = split("v", "vertical", 0.5, row3(), leaf("d"));
    const next = movePaneInTree(root, "b", "d", "below");
    const rects = paneRects(next);
    assertClose(rects.get("a")!.w, 1 / 2, "a.w");
    assertClose(rects.get("c")!.w, 1 / 2, "c.w");
    for (const id of ["a", "d", "b"]) assertClose(rects.get(id)!.h, 1 / 3, `${id}.h`);
  });

  it("re-equalizes the remaining run when the removed pane's parent was its root", () => {
    // a | (b | c) with a lopsided inner split; drag a below d (outside the row).
    const root = split(
      "v",
      "vertical",
      0.5,
      split("r1", "horizontal", 0.2, leaf("a"), split("r2", "horizontal", 0.7, leaf("b"), leaf("c"))),
      leaf("d"),
    );
    const next = movePaneInTree(root, "a", "d", "below");
    const rects = paneRects(next);
    assertClose(rects.get("b")!.w, 1 / 2, "b.w");
    assertClose(rects.get("c")!.w, 1 / 2, "c.w");
  });

  it("keeps ratios outside the touched runs", () => {
    // (a | b | c) / d at a user-dragged 0.7; moving within the row keeps the outer split.
    const root = split("v", "vertical", 0.7, row3(), leaf("d"));
    const next = movePaneInTree(root, "a", "c", "right");
    assert.equal(next.kind === "split" && next.ratio, 0.7);
    const rects = paneRects(next);
    assert.deepEqual(
      collectPanes(next).map((p) => p.id),
      ["b", "c", "a", "d"],
    );
    for (const id of ["b", "c", "a"]) assertClose(rects.get(id)!.w, 1 / 3, `${id}.w`);
  });

  it("moving out of a two-pane layout keeps the remaining pane whole", () => {
    const root = split("h", "horizontal", 0.3, leaf("a"), leaf("b"));
    const next = movePaneInTree(root, "a", "b", "below");
    const rects = paneRects(next);
    assertClose(rects.get("a")!.h, 1 / 2, "a.h");
    assertClose(rects.get("b")!.h, 1 / 2, "b.h");
    assert.deepEqual(findPane(next, "a"), pane("a"));
  });
});

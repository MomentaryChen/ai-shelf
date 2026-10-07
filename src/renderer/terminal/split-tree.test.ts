import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPanes,
  equalizeRunAroundPane,
  splitPaneInTree,
  type LayoutNode,
  type PaneInfo,
  type SplitDirection,
} from "./split-tree.js";

function pane(id: string): PaneInfo {
  return { id, tool: "shell", sessionId: `s-${id}`, cwd: "/tmp" };
}

/** Width (or height) share of each pane along `direction`, top-level only. */
function shares(node: LayoutNode, direction: SplitDirection, size = 1): Record<string, number> {
  if (node.kind === "pane") return { [node.pane.id]: size };
  if (node.direction !== direction) {
    return Object.fromEntries(collectPanes(node).map((p) => [p.id, size]));
  }
  return {
    ...shares(node.first, direction, size * node.ratio),
    ...shares(node.second, direction, size * (1 - node.ratio)),
  };
}

function addAndEqualize(root: LayoutNode, targetId: string, id: string, direction: SplitDirection) {
  return equalizeRunAroundPane(splitPaneInTree(root, targetId, direction, pane(id)), id);
}

function assertShares(actual: Record<string, number>, expected: Record<string, number>) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const [id, v] of Object.entries(expected)) {
    assert.ok(Math.abs(actual[id]! - v) < 1e-9, `${id}: ${actual[id]} != ${v}`);
  }
}

describe("equalizeRunAroundPane", () => {
  it("splitting the newest pane repeatedly keeps columns equal", () => {
    let root: LayoutNode = { kind: "pane", pane: pane("p1") };
    for (let i = 2; i <= 8; i++) root = addAndEqualize(root, `p${i - 1}`, `p${i}`, "horizontal");
    const expected = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`p${i + 1}`, 1 / 8]),
    );
    assertShares(shares(root, "horizontal"), expected);
  });

  it("splitting a middle pane still yields equal columns", () => {
    let root: LayoutNode = { kind: "pane", pane: pane("a") };
    root = addAndEqualize(root, "a", "b", "horizontal");
    root = addAndEqualize(root, "a", "c", "horizontal");
    assertShares(shares(root, "horizontal"), { a: 1 / 3, c: 1 / 3, b: 1 / 3 });
  });

  it("treats a perpendicular split as a single slot and keeps its ratio", () => {
    const stack: LayoutNode = {
      kind: "split",
      id: "stack",
      direction: "vertical",
      ratio: 0.7,
      first: { kind: "pane", pane: pane("top") },
      second: { kind: "pane", pane: pane("bottom") },
    };
    const root: LayoutNode = {
      kind: "split",
      id: "row",
      direction: "horizontal",
      ratio: 0.8,
      first: stack,
      second: { kind: "pane", pane: pane("right") },
    };
    const next = addAndEqualize(root, "right", "new", "horizontal");
    assertShares(shares(next, "horizontal"), {
      top: 1 / 3,
      bottom: 1 / 3,
      right: 1 / 3,
      new: 1 / 3,
    });
    assert.equal(next.kind === "split" && next.first.kind === "split" && next.first.ratio, 0.7);
  });

  it("splitting inside a column only evens out that column", () => {
    const root: LayoutNode = {
      kind: "split",
      id: "row",
      direction: "horizontal",
      ratio: 0.3,
      first: { kind: "pane", pane: pane("left") },
      second: { kind: "pane", pane: pane("right") },
    };
    let next = addAndEqualize(root, "right", "r2", "vertical");
    next = addAndEqualize(next, "r2", "r3", "vertical");
    assert.equal(next.kind === "split" && next.ratio, 0.3);
    const column = next.kind === "split" ? next.second : next;
    assertShares(shares(column, "vertical"), { right: 1 / 3, r2: 1 / 3, r3: 1 / 3 });
  });
});

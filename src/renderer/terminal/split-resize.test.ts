import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_SPLIT_RATIO,
  MIN_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  MIN_SPLIT_RATIO,
  SPLIT_DIVIDER_PX,
  clampSplitRatio,
  clampSplitRatioPx,
  minNodePx,
  rawRatioFromPointer,
  splitFlexPair,
  splitSideFlex,
} from "./split-resize.js";
import { updateSplitRatio, type LayoutNode } from "./split-tree.js";

describe("clampSplitRatio", () => {
  it("keeps ratios inside the bounds", () => {
    assert.equal(clampSplitRatio(0.4), 0.4);
    assert.equal(clampSplitRatio(0), MIN_SPLIT_RATIO);
    assert.equal(clampSplitRatio(-3), MIN_SPLIT_RATIO);
    assert.equal(clampSplitRatio(1), MAX_SPLIT_RATIO);
    assert.equal(clampSplitRatio(42), MAX_SPLIT_RATIO);
  });

  it("falls back to an even split for non-finite input", () => {
    assert.equal(clampSplitRatio(Number.NaN), 0.5);
    assert.equal(clampSplitRatio(Number.POSITIVE_INFINITY), 0.5);
  });

  it("is idempotent", () => {
    for (const r of [-1, 0.05, 0.3, 0.95, 2]) {
      assert.equal(clampSplitRatio(clampSplitRatio(r)), clampSplitRatio(r));
    }
  });
});

describe("rawRatioFromPointer", () => {
  it("divides the pointer offset by the container size", () => {
    assert.equal(rawRatioFromPointer(250, 1000), 0.25);
    assert.equal(rawRatioFromPointer(-10, 100), -0.1);
  });

  it("returns null for an unsized container", () => {
    assert.equal(rawRatioFromPointer(10, 0), null);
    assert.equal(rawRatioFromPointer(10, -5), null);
    assert.equal(rawRatioFromPointer(10, Number.NaN), null);
  });
});

describe("splitSideFlex / splitFlexPair", () => {
  it("builds the flex shorthand with the nested-divider basis", () => {
    assert.equal(splitSideFlex(0.3, 0), "0.3 1 0px");
    assert.equal(splitSideFlex(0.5, 20), "0.5 1 20px");
  });

  it("gives the second side the remaining share", () => {
    const pair = splitFlexPair(0.25, 10, 0);
    assert.equal(pair.first, "0.25 1 10px");
    assert.equal(pair.second, "0.75 1 0px");
  });

  it("matches what a committed layout renders (no jump on pointerup)", () => {
    const layout: LayoutNode = {
      kind: "split",
      id: "s1",
      direction: "horizontal",
      ratio: 0.5,
      first: { kind: "pane", pane: { id: "a", sessionId: "a", tool: "shell" } as never },
      second: { kind: "pane", pane: { id: "b", sessionId: "b", tool: "shell" } as never },
    };
    for (const raw of [0.03, 0.37, 0.7, 0.99]) {
      const preview = clampSplitRatio(raw);
      const committed = updateSplitRatio(layout, "s1", preview);
      assert.equal(committed.kind, "split");
      if (committed.kind !== "split") continue;
      assert.deepEqual(
        splitFlexPair(clampSplitRatio(committed.ratio), 0, 0),
        splitFlexPair(preview, 0, 0),
      );
    }
  });
});

const leafNode = (id: string): LayoutNode =>
  ({ kind: "pane", pane: { id, sessionId: id, tool: "shell", cwd: "" } }) as LayoutNode;
const splitNode = (
  id: string,
  direction: "horizontal" | "vertical",
  first: LayoutNode,
  second: LayoutNode,
): LayoutNode => ({ kind: "split", id, direction, ratio: 0.5, first, second });

describe("minNodePx", () => {
  it("a pane needs the per-axis minimum", () => {
    assert.equal(minNodePx(leafNode("a"), "horizontal"), MIN_PANE_WIDTH_PX);
    assert.equal(minNodePx(leafNode("a"), "vertical"), MIN_PANE_HEIGHT_PX);
  });

  it("stacks same-direction panes plus their dividers", () => {
    const three = splitNode("s1", "horizontal", leafNode("a"), splitNode("s2", "horizontal", leafNode("b"), leafNode("c")));
    assert.equal(minNodePx(three, "horizontal"), 3 * MIN_PANE_WIDTH_PX + 2 * SPLIT_DIVIDER_PX);
    // Across the other axis the three columns sit side by side: one pane tall.
    assert.equal(minNodePx(three, "vertical"), MIN_PANE_HEIGHT_PX);
  });

  it("takes the larger child of a perpendicular split", () => {
    // (a | b) / c  → width needs the two columns; height needs two rows.
    const node = splitNode("v", "vertical", splitNode("h", "horizontal", leafNode("a"), leafNode("b")), leafNode("c"));
    assert.equal(minNodePx(node, "horizontal"), 2 * MIN_PANE_WIDTH_PX + SPLIT_DIVIDER_PX);
    assert.equal(minNodePx(node, "vertical"), 2 * MIN_PANE_HEIGHT_PX + SPLIT_DIVIDER_PX);
  });
});

describe("clampSplitRatioPx", () => {
  const simple = (containerPx: number, firstMinPx = 160, secondMinPx = 160) => ({
    containerPx,
    dividerPx: 10,
    firstBasisPx: 0,
    secondBasisPx: 0,
    firstMinPx,
    secondMinPx,
  });

  it("keeps each side at least its pixel minimum", () => {
    // free = 790 → each side ≥ 160px ⇒ ratio in [160/790, 630/790].
    const b = simple(800);
    assert.ok(Math.abs(clampSplitRatioPx(0.05, b) - 160 / 790) < 1e-12);
    assert.ok(Math.abs(clampSplitRatioPx(0.99, b) - 630 / 790) < 1e-12);
    assert.equal(clampSplitRatioPx(0.5, b), 0.5);
  });

  it("never loosens the 0.1–0.9 ratio clamp on wide containers", () => {
    const b = simple(4000);
    assert.equal(clampSplitRatioPx(0.02, b), MIN_SPLIT_RATIO);
    assert.equal(clampSplitRatioPx(0.98, b), MAX_SPLIT_RATIO);
  });

  it("accounts for nested-divider bases and multi-pane sides", () => {
    // Second side holds 3 columns: min = 3×160 + 2×10 = 500, basis 20.
    const b = {
      containerPx: 1000,
      dividerPx: 10,
      firstBasisPx: 0,
      secondBasisPx: 20,
      firstMinPx: 160,
      secondMinPx: 500,
    };
    const free = 1000 - 10 - 20;
    const r = clampSplitRatioPx(0.9, b);
    assert.ok(Math.abs(r - (1 - (500 - 20) / free)) < 1e-12);
    // Rendered second side: basis + (1 − r) × free == its minimum.
    assert.ok(Math.abs(20 + (1 - r) * free - 500) < 1e-9);
  });

  it("falls back to the plain ratio clamp when both minimums do not fit", () => {
    const b = simple(300);
    for (const raw of [-1, 0.05, 0.3, 0.7, 0.95, 2]) {
      assert.equal(clampSplitRatioPx(raw, b), clampSplitRatio(raw));
    }
    assert.equal(clampSplitRatioPx(0.3, simple(0)), 0.3);
    assert.equal(clampSplitRatioPx(Number.NaN, simple(800)), 0.5);
  });

  it("commits a value updateSplitRatio keeps unchanged (no jump on pointerup)", () => {
    const layout = splitNode("s1", "horizontal", leafNode("a"), leafNode("b"));
    for (const containerPx of [300, 500, 800, 2000]) {
      for (const raw of [-0.2, 0.03, 0.15, 0.5, 0.88, 1.3]) {
        const preview = clampSplitRatioPx(raw, simple(containerPx));
        const committed = updateSplitRatio(layout, "s1", preview);
        assert.equal(committed.kind === "split" && committed.ratio, preview);
      }
    }
  });
});

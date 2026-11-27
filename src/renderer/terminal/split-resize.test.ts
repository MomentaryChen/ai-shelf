import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  clampSplitRatio,
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

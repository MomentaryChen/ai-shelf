import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPointOutsideWindows,
  normalizePopoutSize,
  POPOUT_DEFAULT_SIZE,
  POPOUT_MIN_SIZE,
  popoutBoundsAtPoint,
  popoutBoundsNearWindow,
} from "./popout-geometry.js";
import type { Rect } from "./window-bounds.js";

const laptop: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const external: Rect = { x: 1920, y: 0, width: 2560, height: 1400 };
const mainWin: Rect = { x: 100, y: 100, width: 1200, height: 800 };

describe("isPointOutsideWindows", () => {
  it("is false when the point is inside any window", () => {
    assert.equal(isPointOutsideWindows({ x: 500, y: 500 }, [mainWin]), false);
  });

  it("is true on another monitor with no window there", () => {
    assert.equal(isPointOutsideWindows({ x: 2500, y: 300 }, [mainWin]), true);
  });

  it("treats the right/bottom edge as outside", () => {
    assert.equal(isPointOutsideWindows({ x: 1300, y: 500 }, [mainWin]), true);
    assert.equal(isPointOutsideWindows({ x: 1299, y: 899 }, [mainWin]), false);
  });

  it("is true when there are no windows", () => {
    assert.equal(isPointOutsideWindows({ x: 0, y: 0 }, []), true);
  });

  it("checks every window", () => {
    const other: Rect = { x: 2000, y: 100, width: 600, height: 400 };
    assert.equal(isPointOutsideWindows({ x: 2100, y: 200 }, [mainWin, other]), false);
  });
});

describe("normalizePopoutSize", () => {
  it("keeps a reasonable pane size", () => {
    assert.deepEqual(normalizePopoutSize({ width: 900, height: 600 }), { width: 900, height: 600 });
  });

  it("raises tiny panes to the minimum", () => {
    assert.deepEqual(normalizePopoutSize({ width: 100, height: 50 }), POPOUT_MIN_SIZE);
  });

  it("falls back to the default for missing or bad values", () => {
    assert.deepEqual(normalizePopoutSize(null), POPOUT_DEFAULT_SIZE);
    assert.deepEqual(normalizePopoutSize({ width: Number.NaN, height: -4 }), POPOUT_DEFAULT_SIZE);
  });

  it("rounds fractional CSS sizes", () => {
    assert.deepEqual(normalizePopoutSize({ width: 640.6, height: 480.2 }), {
      width: 641,
      height: 480,
    });
  });
});

describe("popoutBoundsAtPoint", () => {
  it("puts the cursor on the header near the left edge", () => {
    const r = popoutBoundsAtPoint({ x: 2600, y: 400 }, { width: 800, height: 500 }, external);
    assert.deepEqual(r, { x: 2552, y: 384, width: 800, height: 500 });
  });

  it("clamps into the work area of the release display", () => {
    const r = popoutBoundsAtPoint({ x: 4450, y: 1390 }, { width: 800, height: 500 }, external);
    assert.equal(r.x + r.width, external.x + external.width);
    assert.equal(r.y + r.height, external.y + external.height);
  });

  it("does not leak onto the neighbouring monitor at its left edge", () => {
    const r = popoutBoundsAtPoint({ x: 1925, y: 300 }, { width: 800, height: 500 }, external);
    assert.equal(r.x, external.x);
  });

  it("shrinks a window larger than the display", () => {
    const r = popoutBoundsAtPoint({ x: 100, y: 100 }, { width: 5000, height: 3000 }, laptop);
    assert.deepEqual(r, laptop);
  });
});

describe("popoutBoundsNearWindow", () => {
  it("cascades from the origin window", () => {
    const r = popoutBoundsNearWindow(mainWin, { width: 800, height: 500 }, laptop);
    assert.deepEqual(r, { x: 148, y: 148, width: 800, height: 500 });
  });

  it("stays inside the work area when the origin sits at the bottom-right", () => {
    const origin: Rect = { x: 1500, y: 800, width: 400, height: 200 };
    const r = popoutBoundsNearWindow(origin, { width: 800, height: 500 }, laptop);
    assert.equal(r.x + r.width <= laptop.width, true);
    assert.equal(r.y + r.height <= laptop.height, true);
  });
});

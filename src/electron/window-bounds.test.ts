import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  centerIn,
  clampToWorkArea,
  isTitleBarVisible,
  pickWorkArea,
  resolveInitialBounds,
  type Rect,
} from "./window-bounds.js";

// Laptop 1920x1040 work area on the left, external 2560x1400 monitor on the right.
const laptop: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const external: Rect = { x: 1920, y: 0, width: 2560, height: 1400 };
const DEFAULTS = { width: 1200, height: 800 };
const MIN = { width: 900, height: 600 };

describe("resolveInitialBounds", () => {
  it("centers the default size on the fallback display when nothing is saved", () => {
    const r = resolveInitialBounds({
      saved: null,
      defaults: DEFAULTS,
      workAreas: [laptop, external],
      fallbackWorkArea: external,
    });
    assert.deepEqual(r, { x: 1920 + 680, y: 300, width: 1200, height: 800 });
  });

  it("keeps saved bounds on a monitor that is still connected", () => {
    const saved = { x: 2200, y: 100, width: 1400, height: 900 };
    const r = resolveInitialBounds({
      saved,
      defaults: DEFAULTS,
      minSize: MIN,
      workAreas: [laptop, external],
      fallbackWorkArea: laptop,
    });
    assert.deepEqual(r, saved);
  });

  it("moves a window from an unplugged monitor onto the remaining one", () => {
    const r = resolveInitialBounds({
      saved: { x: 2200, y: 100, width: 1400, height: 900 },
      defaults: DEFAULTS,
      minSize: MIN,
      workAreas: [laptop],
      fallbackWorkArea: laptop,
    });
    assert.deepEqual(r, { x: 260, y: 70, width: 1400, height: 900 });
  });

  it("shrinks a saved window bigger than the remaining display", () => {
    const r = resolveInitialBounds({
      saved: { x: 1920, y: 0, width: 2560, height: 1400 },
      defaults: DEFAULTS,
      minSize: MIN,
      workAreas: [laptop],
      fallbackWorkArea: laptop,
    });
    assert.deepEqual(r, laptop);
  });

  it("ignores corrupt saved state", () => {
    const r = resolveInitialBounds({
      saved: { x: Number.NaN, y: 0, width: 0, height: 10 },
      defaults: DEFAULTS,
      workAreas: [laptop],
      fallbackWorkArea: laptop,
    });
    assert.deepEqual(r, { x: 360, y: 120, width: 1200, height: 800 });
  });

  it("supports monitors at negative coordinates (left of primary)", () => {
    const left: Rect = { x: -1920, y: 0, width: 1920, height: 1040 };
    const saved = { x: -1500, y: 50, width: 1200, height: 800 };
    const r = resolveInitialBounds({
      saved,
      defaults: DEFAULTS,
      workAreas: [left, laptop],
      fallbackWorkArea: laptop,
    });
    assert.deepEqual(r, saved);
  });
});

describe("isTitleBarVisible", () => {
  it("is false when only the bottom of the window is on screen", () => {
    assert.equal(isTitleBarVisible({ x: 100, y: -700, width: 1200, height: 800 }, [laptop]), false);
  });

  it("is true when the title bar straddles two monitors", () => {
    assert.equal(
      isTitleBarVisible({ x: 1500, y: 10, width: 1200, height: 800 }, [laptop, external]),
      true,
    );
  });
});

describe("pickWorkArea", () => {
  it("picks the display with the largest overlap", () => {
    assert.equal(
      pickWorkArea({ x: 1800, y: 0, width: 1000, height: 800 }, [laptop, external]),
      external,
    );
  });

  it("falls back to the nearest display when nothing overlaps", () => {
    assert.equal(
      pickWorkArea({ x: 5000, y: 0, width: 100, height: 100 }, [laptop, external]),
      external,
    );
  });
});

describe("centerIn / clampToWorkArea", () => {
  it("centers a dialog on its parent", () => {
    const parent: Rect = { x: 2000, y: 100, width: 1200, height: 800 };
    assert.deepEqual(centerIn({ width: 520, height: 720 }, parent, external), {
      x: 2340,
      y: 140,
      width: 520,
      height: 720,
    });
  });

  it("keeps a dialog inside the display when the parent hangs off its edge", () => {
    const parent: Rect = { x: 1700, y: 600, width: 400, height: 300 };
    assert.deepEqual(centerIn({ width: 680, height: 760 }, parent, laptop), {
      x: 1240,
      y: 280,
      width: 680,
      height: 760,
    });
  });

  it("enforces a minimum size before clamping", () => {
    assert.deepEqual(clampToWorkArea({ x: 0, y: 0, width: 200, height: 200 }, laptop, MIN), {
      x: 0,
      y: 0,
      width: 900,
      height: 600,
    });
  });
});

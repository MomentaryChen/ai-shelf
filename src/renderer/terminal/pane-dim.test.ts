import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_UNFOCUSED_PANE_DIM,
  isUnfocusedPaneDim,
  normalizeUnfocusedPaneDim,
  UNFOCUSED_PANE_DIM_LEVELS,
  unfocusedPaneDimOpacity,
} from "./pane-dim";

describe("unfocusedPaneDimOpacity", () => {
  it("maps each level to its opacity", () => {
    assert.equal(unfocusedPaneDimOpacity("off"), 1);
    assert.equal(unfocusedPaneDimOpacity("subtle"), 0.9);
    assert.equal(unfocusedPaneDimOpacity("normal"), 0.8);
    assert.equal(unfocusedPaneDimOpacity("strong"), 0.6);
  });

  it("gets lighter-to-darker in level order", () => {
    const values = UNFOCUSED_PANE_DIM_LEVELS.map(unfocusedPaneDimOpacity);
    for (let i = 1; i < values.length; i++) assert.ok(values[i]! < values[i - 1]!);
  });

  it("keeps the pre-setting look (0.8) by default and for bad input", () => {
    assert.equal(DEFAULT_UNFOCUSED_PANE_DIM, "normal");
    assert.equal(unfocusedPaneDimOpacity(undefined), 0.8);
    assert.equal(unfocusedPaneDimOpacity("max"), 0.8);
  });
});

describe("normalizeUnfocusedPaneDim", () => {
  it("keeps valid stored values", () => {
    for (const level of UNFOCUSED_PANE_DIM_LEVELS) {
      assert.equal(normalizeUnfocusedPaneDim(level), level);
      assert.ok(isUnfocusedPaneDim(level));
    }
  });

  it("falls back to the default for missing, wrong-typed or unknown values", () => {
    for (const raw of [undefined, null, "", "Strong", 0.6, true, {}, ["off"]]) {
      assert.equal(normalizeUnfocusedPaneDim(raw), DEFAULT_UNFOCUSED_PANE_DIM);
      assert.equal(isUnfocusedPaneDim(raw), false);
    }
  });
});

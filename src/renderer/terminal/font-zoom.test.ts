import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FONT_ZOOM_MAX, FONT_ZOOM_MIN, clampFontSize, zoomFontSize } from "./font-zoom.js";

describe("font zoom", () => {
  it("steps one point in and out", () => {
    assert.equal(zoomFontSize(14, "in", 14), 15);
    assert.equal(zoomFontSize(14, "out", 14), 13);
  });

  it("clamps at the settings bounds", () => {
    assert.equal(zoomFontSize(FONT_ZOOM_MAX, "in", 14), FONT_ZOOM_MAX);
    assert.equal(zoomFontSize(FONT_ZOOM_MIN, "out", 14), FONT_ZOOM_MIN);
    assert.equal(zoomFontSize(100, "out", 14), FONT_ZOOM_MAX - 1);
  });

  it("reset returns the default size", () => {
    assert.equal(zoomFontSize(22, "reset", 14), 14);
  });

  it("clampFontSize rounds and handles junk", () => {
    assert.equal(clampFontSize(13.6), 14);
    assert.equal(clampFontSize(Number.NaN), FONT_ZOOM_MIN);
    assert.equal(clampFontSize(2), FONT_ZOOM_MIN);
  });
});

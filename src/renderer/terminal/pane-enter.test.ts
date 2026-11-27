import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enteringPaneIds } from "./pane-enter.js";

describe("enteringPaneIds", () => {
  it("animates nothing on the first render", () => {
    assert.deepEqual(enteringPaneIds(null, ["a", "b"]), []);
  });

  it("returns only the pane added by a split", () => {
    assert.deepEqual(enteringPaneIds(["a"], ["a", "b"]), ["b"]);
  });

  it("returns a restored (un-minimized or docked) pane", () => {
    assert.deepEqual(enteringPaneIds(["a", "b"], ["a", "c", "b"]), ["c"]);
  });

  it("animates nothing when panes are only closed or reordered", () => {
    assert.deepEqual(enteringPaneIds(["a", "b", "c"], ["c", "a"]), []);
  });

  it("animates nothing when the whole set is swapped (profile switch)", () => {
    assert.deepEqual(enteringPaneIds(["a", "b"], ["x", "y"]), []);
  });

  it("animates nothing when going from no panes to some", () => {
    assert.deepEqual(enteringPaneIds([], ["a"]), []);
  });
});

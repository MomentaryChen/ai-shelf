import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupIndexById, stepIndex } from "./workspace-slide.js";

describe("groupIndexById", () => {
  const groups = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the matching index", () => {
    assert.equal(groupIndexById(groups, "b"), 1);
  });

  it("returns 0 when the id is missing", () => {
    assert.equal(groupIndexById(groups, "missing"), 0);
    assert.equal(groupIndexById([], "a"), 0);
  });
});

describe("stepIndex", () => {
  it("steps within bounds without wrapping", () => {
    assert.equal(stepIndex(3, 0, 1), 1);
    assert.equal(stepIndex(3, 2, -1), 1);
  });

  it("clamps at the ends", () => {
    assert.equal(stepIndex(3, 0, -1), 0);
    assert.equal(stepIndex(3, 2, 1), 2);
  });

  it("handles empty lists", () => {
    assert.equal(stepIndex(0, 0, 1), 0);
  });
});

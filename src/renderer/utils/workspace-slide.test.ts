import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupIndexById, isWrapStep, stepIndex } from "./workspace-slide.js";

describe("groupIndexById", () => {
  const groups = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the matching index", () => {
    assert.equal(groupIndexById(groups, "b"), 1);
    assert.equal(groupIndexById(groups, "a"), 0);
  });

  it("returns 0 when the id is missing", () => {
    assert.equal(groupIndexById(groups, "missing"), 0);
    assert.equal(groupIndexById([], "a"), 0);
  });
});

describe("stepIndex", () => {
  it("steps within bounds", () => {
    assert.equal(stepIndex(3, 0, 1), 1);
    assert.equal(stepIndex(3, 2, -1), 1);
  });

  it("wraps at the ends", () => {
    assert.equal(stepIndex(3, 0, -1), 2);
    assert.equal(stepIndex(3, 2, 1), 0);
  });

  it("wraps with a single item", () => {
    assert.equal(stepIndex(1, 0, 1), 0);
    assert.equal(stepIndex(1, 0, -1), 0);
  });

  it("handles empty lists", () => {
    assert.equal(stepIndex(0, 0, 1), 0);
  });
});

describe("isWrapStep", () => {
  it("detects end-to-end wraps", () => {
    assert.equal(isWrapStep(3, 0, 2), true);
    assert.equal(isWrapStep(3, 2, 0), true);
  });

  it("is false for adjacent steps", () => {
    assert.equal(isWrapStep(3, 0, 1), false);
    assert.equal(isWrapStep(3, 1, 0), false);
  });

  it("is false for short lists", () => {
    assert.equal(isWrapStep(1, 0, 0), false);
    assert.equal(isWrapStep(2, 0, 1), false);
    assert.equal(isWrapStep(2, 1, 0), false);
  });
});

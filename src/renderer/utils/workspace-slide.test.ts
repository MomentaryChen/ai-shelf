import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  directionBetween,
  groupIndexById,
  isWrapStep,
  slideClassName,
  slideDirection,
  stepIndex,
} from "./workspace-slide.js";

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

describe("slideDirection", () => {
  it("steps forward and backward by one item", () => {
    assert.equal(slideDirection(3, 0, 1), "next");
    assert.equal(slideDirection(3, 1, 0), "prev");
    assert.equal(slideDirection(3, 1, 2), "next");
  });

  it("fades when the jump is more than one item", () => {
    assert.equal(slideDirection(3, 0, 2), "fade");
    assert.equal(slideDirection(3, 2, 0), "fade");
    assert.equal(slideDirection(5, 0, 2), "fade");
    assert.equal(slideDirection(5, 4, 1), "fade");
  });

  it("does not animate a no-op or an out-of-range index", () => {
    assert.equal(slideDirection(3, 1, 1), null);
    assert.equal(slideDirection(1, 0, 0), null);
    assert.equal(slideDirection(3, -1, 0), null);
  });
});

describe("directionBetween", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("maps ids onto slide direction", () => {
    assert.equal(directionBetween(items, "a", "b"), "next");
    assert.equal(directionBetween(items, "b", "a"), "prev");
    assert.equal(directionBetween(items, "a", "c"), "fade");
  });

  it("fades when an id is not in the list", () => {
    assert.equal(directionBetween(items, "a", "missing"), "fade");
    assert.equal(directionBetween(items, "missing", "b"), "fade");
  });

  it("does not animate the first selection or a repeat", () => {
    assert.equal(directionBetween(items, null, "a"), null);
    assert.equal(directionBetween(items, "a", "a"), null);
    assert.equal(directionBetween(items, "a", null), null);
  });
});

describe("slideClassName", () => {
  it("adds an alt suffix on odd epochs so the same direction can replay", () => {
    assert.equal(slideClassName("next", "profile-slide", 0), "profile-slide-next");
    assert.equal(slideClassName("next", "profile-slide", 1), "profile-slide-next-alt");
    assert.equal(slideClassName("fade", "profile-stage", 2), "profile-stage-fade");
    assert.equal(slideClassName(null), "");
  });
});

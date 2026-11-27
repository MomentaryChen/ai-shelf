import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alignAnimationsToTimeline } from "./animation-sync.js";

describe("alignAnimationsToTimeline", () => {
  it("pins every animation to the timeline origin", () => {
    const animations = [{ startTime: 1234 as unknown }, { startTime: null as unknown }];
    alignAnimationsToTimeline({ getAnimations: () => animations });
    assert.deepEqual(
      animations.map((a) => a.startTime),
      [0, 0],
    );
  });

  it("ignores a missing element or one without the Web Animations API", () => {
    assert.doesNotThrow(() => alignAnimationsToTimeline(null));
    assert.doesNotThrow(() => alignAnimationsToTimeline(undefined));
    assert.doesNotThrow(() => alignAnimationsToTimeline({}));
  });

  it("does nothing when no animation runs (idle or reduced motion)", () => {
    assert.doesNotThrow(() => alignAnimationsToTimeline({ getAnimations: () => [] }));
  });
});

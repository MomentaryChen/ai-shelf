import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POST_RESUME_QUIET_MS,
  createRecoveryCoalescer,
  inPostResumeQuiet,
  noteSystemResume,
  planWindowNudge,
  ptyWakeResizeSteps,
  resetSystemResumeForTests,
} from "./system-resume.js";

describe("system-resume", () => {
  it("stays quiet only for the post-resume window", () => {
    resetSystemResumeForTests();
    assert.equal(inPostResumeQuiet(10_000), false);
    noteSystemResume(10_000);
    assert.equal(inPostResumeQuiet(10_000 + POST_RESUME_QUIET_MS - 1), true);
    assert.equal(inPostResumeQuiet(10_000 + POST_RESUME_QUIET_MS), false);
    resetSystemResumeForTests();
  });

  it("nudges a visible window and leaves tray / minimized windows alone", () => {
    assert.deepEqual(
      planWindowNudge({
        destroyed: false,
        visible: true,
        minimized: false,
        width: 800,
        height: 600,
      }),
      { width: 800, height: 600 },
    );
    assert.equal(
      planWindowNudge({
        destroyed: false,
        visible: false,
        minimized: false,
        width: 800,
        height: 600,
      }),
      null,
    );
    assert.equal(
      planWindowNudge({
        destroyed: false,
        visible: true,
        minimized: true,
        width: 800,
        height: 600,
      }),
      null,
    );
  });

  it("wakes ConPTY with a one-row dip restored to the real size", () => {
    assert.deepEqual(ptyWakeResizeSteps(120, 40), [
      { cols: 120, rows: 39 },
      { cols: 120, rows: 40 },
    ]);
    assert.deepEqual(ptyWakeResizeSteps(0, 0), [
      { cols: 80, rows: 23 },
      { cols: 80, rows: 24 },
    ]);
    assert.deepEqual(ptyWakeResizeSteps(100, 2), [{ cols: 100, rows: 2 }]);
  });

  it("coalesces a burst of recovery events into one refresh", () => {
    const steps: Array<() => void> = [];
    let fired = 0;
    const coalescer = createRecoveryCoalescer(
      600,
      () => {
        fired += 1;
      },
      (fn) => {
        steps.push(fn);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    );
    coalescer.arm();
    coalescer.arm();
    assert.equal(steps.length, 1);
    assert.equal(fired, 0);
    steps[0]!();
    assert.equal(fired, 1);
    coalescer.arm();
    assert.equal(steps.length, 2);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPtyDataPendingState,
  dropPtyDataPending,
  peekPtyPending,
  pumpPtyDataPending,
  queuePtyDataPending,
  shouldDropPendingOnBufferAttach,
  takePtyDataPending,
  takePtyDataPendingLimited,
} from "./pty-data-pending.js";

describe("pty-data-pending", () => {
  it("coalesces chunks until take flushes them", async () => {
    const state = createPtyDataPendingState();
    const flushed: string[] = [];
    queuePtyDataPending(state, "s1", "a", 15, (id) => {
      flushed.push(takePtyDataPending(state, id));
    });
    queuePtyDataPending(state, "s1", "b", 15, () => {
      assert.fail("second queue must not arm another timer");
    });
    assert.equal(peekPtyPending(state, "s1"), "ab");
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(flushed, ["ab"]);
    assert.equal(state.pending.has("s1"), false);
  });

  it("drop cancels the timer so attach replay cannot double-paint", async () => {
    const state = createPtyDataPendingState();
    let flushed = false;
    queuePtyDataPending(state, "s1", "dup", 15, () => {
      flushed = true;
    });
    dropPtyDataPending(state, "s1");
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(flushed, false);
    assert.equal(state.pending.has("s1"), false);
  });

  it("buffer attach drops pending; meta-only attach keeps it", () => {
    assert.equal(shouldDropPendingOnBufferAttach(true), true);
    assert.equal(shouldDropPendingOnBufferAttach(false), false);
  });

  it("limited take leaves the tail and does not copy it into the sent slice", () => {
    const state = createPtyDataPendingState();
    queuePtyDataPending(state, "s1", "a".repeat(50) + "b".repeat(50), 1_000, () => {});
    const first = takePtyDataPendingLimited(state, "s1", 40);
    assert.equal(first.data, "a".repeat(40));
    assert.equal(first.rest, true);
    assert.equal(peekPtyPending(state, "s1"), "a".repeat(10) + "b".repeat(50));
    const rest = takePtyDataPending(state, "s1");
    assert.equal(rest, "a".repeat(10) + "b".repeat(50));
  });

  it("pump yields between slices and runs done after the tail", () => {
    const state = createPtyDataPendingState();
    queuePtyDataPending(state, "s1", "abcdefghij", 1_000, () => {});
    const sent: string[] = [];
    const steps: Array<() => void> = [];
    let done = false;
    pumpPtyDataPending(
      state,
      "s1",
      4,
      (data) => sent.push(data),
      (run) => {
        steps.push(run);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      () => {
        done = true;
      },
    );
    assert.deepEqual(sent, ["abcd"]);
    assert.equal(done, false);
    assert.equal(steps.length, 1);
    steps[0]!();
    assert.deepEqual(sent, ["abcd", "efgh"]);
    assert.equal(done, false);
    steps[1]!();
    assert.deepEqual(sent, ["abcd", "efgh", "ij"]);
    assert.equal(done, true);
    assert.equal(state.pending.has("s1"), false);
  });
});

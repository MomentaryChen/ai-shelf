import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPtyDataPendingState,
  dropPtyDataPending,
  peekPtyPending,
  ptyDataEndSeq,
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
    assert.equal(ptyDataEndSeq(state, "s1"), 2);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(flushed, ["ab"]);
    assert.equal(state.pending.has("s1"), false);
    assert.equal(ptyDataEndSeq(state, "s1"), 2);
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

  it("keeps the end cursor after the pending tail is dropped", () => {
    const state = createPtyDataPendingState();
    queuePtyDataPending(state, "s1", "hello", 1000, () => {});
    dropPtyDataPending(state, "s1");
    assert.equal(state.pending.has("s1"), false);
    assert.equal(ptyDataEndSeq(state, "s1"), 5);
    assert.equal(takePtyDataPending(state, "s1"), "");
    queuePtyDataPending(state, "s1", "!", 1000, () => {});
    const next = takePtyDataPendingLimited(state, "s1", 10);
    assert.equal(next.data, "!");
    assert.equal(next.endSeq, 6);
    assert.equal(next.rest, false);
  });

  it("limited take leaves the tail and does not copy it into the sent slice", () => {
    const state = createPtyDataPendingState();
    queuePtyDataPending(state, "s1", "a".repeat(50) + "b".repeat(50), 1_000, () => {});
    const first = takePtyDataPendingLimited(state, "s1", 40);
    assert.equal(first.data, "a".repeat(40));
    assert.equal(first.endSeq, 40);
    assert.equal(first.rest, true);
    assert.equal(peekPtyPending(state, "s1"), "a".repeat(10) + "b".repeat(50));
    const rest = takePtyDataPending(state, "s1");
    assert.equal(rest, "a".repeat(10) + "b".repeat(50));
    assert.equal(ptyDataEndSeq(state, "s1"), 100);
  });

  it("slice cursors stay in order across a burst", () => {
    const state = createPtyDataPendingState();
    queuePtyDataPending(state, "s1", "abcdefghij", 1_000, () => {});
    const slices = [
      takePtyDataPendingLimited(state, "s1", 4),
      takePtyDataPendingLimited(state, "s1", 4),
      takePtyDataPendingLimited(state, "s1", 4),
    ];
    assert.deepEqual(
      slices.map((slice) => [slice.data, slice.endSeq, slice.rest]),
      [
        ["abcd", 4, true],
        ["efgh", 8, true],
        ["ij", 10, false],
      ],
    );
  });

  it("pump yields between slices and runs done after the tail", () => {
    const state = createPtyDataPendingState();
    queuePtyDataPending(state, "s1", "abcdefghij", 1_000, () => {});
    const sent: Array<{ data: string; endSeq: number }> = [];
    const steps: Array<() => void> = [];
    let done = false;
    pumpPtyDataPending(
      state,
      "s1",
      4,
      (data, endSeq) => sent.push({ data, endSeq }),
      (run) => {
        steps.push(run);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      () => {
        done = true;
      },
    );
    assert.deepEqual(sent, [{ data: "abcd", endSeq: 4 }]);
    assert.equal(done, false);
    assert.equal(steps.length, 1);
    steps[0]!();
    assert.deepEqual(sent, [
      { data: "abcd", endSeq: 4 },
      { data: "efgh", endSeq: 8 },
    ]);
    assert.equal(done, false);
    steps[1]!();
    assert.deepEqual(sent, [
      { data: "abcd", endSeq: 4 },
      { data: "efgh", endSeq: 8 },
      { data: "ij", endSeq: 10 },
    ]);
    assert.equal(done, true);
    assert.equal(state.pending.has("s1"), false);
  });
});

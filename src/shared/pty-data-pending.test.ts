import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPtyDataPendingState,
  dropPtyDataPending,
  ptyDataEndSeq,
  queuePtyDataPending,
  shouldDropPendingOnBufferAttach,
  takePtyDataPending,
} from "./pty-data-pending.js";

describe("pty-data-pending", () => {
  it("coalesces chunks until take flushes them", async () => {
    const state = createPtyDataPendingState();
    const flushed: { data: string; endSeq: number }[] = [];
    queuePtyDataPending(state, "s1", "a", 15, (id) => {
      flushed.push(takePtyDataPending(state, id));
    });
    queuePtyDataPending(state, "s1", "b", 15, () => {
      assert.fail("second queue must not arm another timer");
    });
    assert.equal(state.pending.get("s1")?.data, "ab");
    assert.equal(state.pending.get("s1")?.endSeq, 2);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(flushed, [{ data: "ab", endSeq: 2 }]);
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

  it("keeps the end cursor after the pending tail is dropped", () => {
    const state = createPtyDataPendingState();
    queuePtyDataPending(state, "s1", "hello", 1000, () => {});
    dropPtyDataPending(state, "s1");
    assert.equal(state.pending.has("s1"), false);
    assert.equal(ptyDataEndSeq(state, "s1"), 5);
    const taken = takePtyDataPending(state, "s1");
    assert.equal(taken.data, "");
    assert.equal(taken.endSeq, 5);
  });
});

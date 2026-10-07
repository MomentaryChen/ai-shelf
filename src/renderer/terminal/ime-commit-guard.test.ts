import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createImeCommitGuardState,
  noteBlurCapture,
  noteCommitDelivered,
  noteCompositionEnd,
  noteCompositionStart,
  noteCompositionUpdate,
  restoreValueAfterBlur,
  takeFinalizeRescue,
} from "./ime-commit-guard.js";

describe("ime-commit-guard state", () => {
  it("restores the commit after blur clears the textarea mid-finalize", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state);
    noteCompositionUpdate(state, "你好");
    noteCompositionEnd(state, "你好", "你好");

    // Capture sees the value; xterm then clears; bubble asks what to restore.
    noteBlurCapture(state, "你好");
    assert.equal(restoreValueAfterBlur(state), "你好");

    // xterm's finalize never emitted onData — rescue injects once.
    assert.equal(takeFinalizeRescue(state), "你好");
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("does not inject when onData already carried the commit", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state);
    noteCompositionUpdate(state, "測");
    noteCompositionEnd(state, "測", "測");
    noteCommitDelivered(state, "測");
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("ignores blur when no finalize is pending", () => {
    const state = createImeCommitGuardState();
    noteBlurCapture(state, "stale");
    assert.equal(restoreValueAfterBlur(state), null);
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("prefers textarea value on compositionend over empty data", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state);
    noteCompositionUpdate(state, "候");
    noteCompositionEnd(state, "候選", "");
    assert.equal(restoreValueAfterBlur(state), "候選");
  });

  it("snapshots on blur capture when compositionend data was empty", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state);
    noteCompositionEnd(state, "", "");
    // Still composing path closed, but capture can still see the value xterm
    // has not yet wiped.
    noteBlurCapture(state, "字");
    assert.equal(restoreValueAfterBlur(state), "字");
  });
});

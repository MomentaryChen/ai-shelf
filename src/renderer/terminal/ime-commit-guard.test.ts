import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createImeCommitGuardState,
  noteBlurCapture,
  noteCommitDelivered,
  noteCompositionEnd,
  noteCompositionStart,
  restoreValueAfterBlur,
  takeFinalizeRescue,
} from "./ime-commit-guard.js";

describe("ime-commit-guard state", () => {
  it("restores the commit after blur clears the textarea mid-finalize", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, 0);
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
    noteCompositionStart(state, 0);
    noteCompositionEnd(state, "測", "測");
    noteBlurCapture(state, "測");
    noteCommitDelivered(state, "測");
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("never injects when no blur interrupted the finalize", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, 0);
    noteCompositionEnd(state, "你好", "你好");
    assert.equal(restoreValueAfterBlur(state), null);
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("does not resend a commit Enter already flushed before compositionend", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, 0);
    // xterm sends "你好" then "\r" from keydown, before compositionend.
    noteCompositionEnd(state, "你好", "你好");
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("ignores blur when no finalize is pending", () => {
    const state = createImeCommitGuardState();
    noteBlurCapture(state, "stale");
    assert.equal(restoreValueAfterBlur(state), null);
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("rescues only this composition, not earlier commits left in the textarea", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, "先幫我載入".length);
    noteCompositionEnd(state, "先幫我載入此文件", "此文件");
    noteBlurCapture(state, "先幫我載入此文件");
    // xterm slices by position, so it needs the whole value back.
    assert.equal(restoreValueAfterBlur(state), "先幫我載入此文件");
    assert.equal(takeFinalizeRescue(state), "此文件");
  });

  it("treats the delivered slice as the commit when the textarea holds earlier text", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, 5);
    noteCompositionEnd(state, "先幫我載入此文件", "此文件");
    noteBlurCapture(state, "先幫我載入此文件");
    noteCommitDelivered(state, "此文件");
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("does not inject a composition that blur canceled (IME keeps its buffer)", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, 0);
    noteBlurCapture(state, "先幫我載入");
    // Chromium finishes the composition after xterm already cleared the textarea.
    noteCompositionEnd(state, "", "先幫我載入");
    assert.equal(restoreValueAfterBlur(state), null);
    assert.equal(takeFinalizeRescue(state), null);

    // On refocus the IME re-offers the whole sentence; that commit is normal.
    noteCompositionStart(state, 0);
    noteCompositionEnd(state, "先幫我載入此文件", "先幫我載入此文件");
    assert.equal(takeFinalizeRescue(state), null);
  });

  it("ignores empty onData when deciding whether the commit arrived", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, 0);
    noteCompositionEnd(state, "字", "字");
    noteBlurCapture(state, "字");
    noteCommitDelivered(state, "");
    assert.equal(takeFinalizeRescue(state), "字");
  });

  it("falls back to compositionend data when the textarea is empty", () => {
    const state = createImeCommitGuardState();
    noteCompositionStart(state, 0);
    noteCompositionEnd(state, "", "候選");
    noteBlurCapture(state, "");
    assert.equal(restoreValueAfterBlur(state), null);
    assert.equal(takeFinalizeRescue(state), "候選");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendFlowConsole,
  beginFlowConsole,
  clearFlowConsole,
  getFlowConsoleBuffer,
  markFlowConsoleFinished,
} from "./flow-console-buffer.js";

describe("flow-console-buffer", () => {
  it("appends chunks and tracks seq", () => {
    beginFlowConsole("flow-a", "run-1");
    const a = appendFlowConsole("run-1", {
      flowId: "flow-a",
      phaseId: "p1",
      stream: "stdout",
      data: "hello",
    });
    const b = appendFlowConsole("run-1", {
      flowId: "flow-a",
      phaseId: "p1",
      stream: "stderr",
      data: "!",
    });
    assert.equal(a.seq, 1);
    assert.equal(b.seq, 2);
    const snap = getFlowConsoleBuffer("run-1");
    assert.equal(snap.text, "hello!");
    assert.equal(snap.phaseId, "p1");
    assert.equal(snap.alive, true);
    assert.equal(snap.lastSeq, 2);
    clearFlowConsole("run-1");
  });

  it("truncates when over maxChars", () => {
    beginFlowConsole("flow-b", "run-2");
    appendFlowConsole("run-2", {
      flowId: "flow-b",
      phaseId: null,
      stream: "stdout",
      data: "abcdefghij",
      maxChars: 6,
    });
    const snap = getFlowConsoleBuffer("run-2");
    assert.equal(snap.text, "efghij");
    assert.equal(snap.truncated, true);
    clearFlowConsole("run-2");
  });

  it("drops previous run buffer when a new run begins for the same flow", () => {
    beginFlowConsole("flow-c", "run-old");
    appendFlowConsole("run-old", {
      flowId: "flow-c",
      phaseId: null,
      stream: "stdout",
      data: "old",
    });
    beginFlowConsole("flow-c", "run-new");
    assert.equal(getFlowConsoleBuffer("run-old").text, "");
    assert.equal(getFlowConsoleBuffer("run-new").text, "");
    markFlowConsoleFinished("run-new");
    assert.equal(getFlowConsoleBuffer("run-new").alive, false);
    clearFlowConsole("run-new");
  });
});

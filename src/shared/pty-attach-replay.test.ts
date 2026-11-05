import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completePtyReplay, createPtyReplayGate, pushPtyChunk } from "./pty-attach-replay.js";

describe("pty attach replay", () => {
  it("drops a live chunk that is already inside the snapshot", () => {
    const gate = createPtyReplayGate();
    assert.equal(pushPtyChunk(gate, { data: "HELLO", endSeq: 5 }), "");
    assert.deepEqual(completePtyReplay(gate, "HELLO", 5), ["HELLO"]);
    assert.equal(gate.appliedSeq, 5);
  });

  it("appends only the tail that arrived after the snapshot", () => {
    const gate = createPtyReplayGate();
    pushPtyChunk(gate, { data: "HELLO", endSeq: 5 });
    pushPtyChunk(gate, { data: "!", endSeq: 6 });
    assert.deepEqual(completePtyReplay(gate, "HELLO", 5), ["HELLO", "!"]);
  });

  it("slices a chunk that straddles the snapshot", () => {
    const gate = createPtyReplayGate();
    pushPtyChunk(gate, { data: "HELLO!", endSeq: 6 });
    assert.deepEqual(completePtyReplay(gate, "HELLO", 5), ["HELLO", "!"]);
  });

  it("does not write a second copy of a chunk that arrives after attach", () => {
    const gate = createPtyReplayGate();
    completePtyReplay(gate, "FRAME", 5);
    assert.equal(pushPtyChunk(gate, { data: "FRAME", endSeq: 5 }), "");
    assert.equal(pushPtyChunk(gate, { data: "OK", endSeq: 7 }), "OK");
    assert.equal(gate.appliedSeq, 7);
  });

  it("ignores a pre-attach chunk that has no cursor", () => {
    const gate = createPtyReplayGate();
    pushPtyChunk(gate, { data: "FRAME" });
    assert.deepEqual(completePtyReplay(gate, "FRAME", 5), ["FRAME"]);
  });
});

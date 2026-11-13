import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INITIAL_OSC133_STREAM, scanOsc133Running } from "./osc133-stream.js";

const A = "\x1b]133;A\x07";
const B = "\x1b]133;B\x07";
const C = "\x1b]133;C\x07";
const D0 = "\x1b]133;D;0\x07";

function feed(...chunks: string[]) {
  return chunks.reduce(scanOsc133Running, INITIAL_OSC133_STREAM);
}

describe("scanOsc133Running", () => {
  it("stays unknown until a C mark is seen", () => {
    assert.equal(feed(`${A}PS> ${B}`).running, null);
    assert.equal(feed("plain output", D0, A).running, null);
  });

  it("C starts a command; D / A / B end it", () => {
    assert.equal(feed(`${A}$ ${B}`, `sleep 60\r\n${C}`).running, true);
    assert.equal(feed(C, "out", `${D0}${A}$ ${B}`).running, false);
    assert.equal(feed(C, D0, A, B, C).running, true);
  });

  it("accepts the ST terminator", () => {
    assert.equal(feed("\x1b]133;C\x1b\\").running, true);
  });

  it("joins a sequence split across chunks", () => {
    const s1 = feed("output \x1b]13");
    assert.equal(s1.running, null);
    assert.equal(s1.carry, "\x1b]13");
    const s2 = scanOsc133Running(s1, "3;C\x07more");
    assert.equal(s2.running, true);
    assert.equal(s2.carry, "");
    const s3 = scanOsc133Running(scanOsc133Running(s2, "x\x1b]133;D;"), "1\x07");
    assert.equal(s3.running, false);
  });

  it("joins an ST terminator split between ESC and backslash", () => {
    const s1 = feed("out\x1b]133;C\x1b");
    assert.equal(s1.running, null);
    assert.equal(scanOsc133Running(s1, "\\more").running, true);
  });

  it("does not carry unrelated escape sequences", () => {
    assert.equal(feed("\x1b[31mred\x1b[0m").carry, "");
    assert.equal(feed("\x1b]7;file://h/tmp\x07").carry, "");
  });

  it("returns the same object when nothing changed", () => {
    const s = feed(C);
    assert.equal(scanOsc133Running(s, "no escapes here"), s);
  });
});

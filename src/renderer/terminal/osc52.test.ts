import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatByteSize,
  normalizeOsc52Mode,
  Osc52Gate,
  OSC52_DEDUPE_MS,
  OSC52_DENY_MUTE_MS,
  parseOsc52,
} from "./osc52";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

describe("parseOsc52", () => {
  it("decodes a clipboard write", () => {
    assert.deepEqual(parseOsc52(`c;${b64("hello")}`), { kind: "write", text: "hello", bytes: 5 });
  });

  it("decodes UTF-8 and an empty selection parameter", () => {
    const r = parseOsc52(`;${b64("中文 ✓")}`);
    assert.equal(r.kind, "write");
    assert.equal(r.kind === "write" && r.text, "中文 ✓");
    assert.equal(r.kind === "write" && r.bytes, Buffer.byteLength("中文 ✓"));
  });

  it("accepts unpadded base64", () => {
    assert.deepEqual(parseOsc52("c;aGk"), { kind: "write", text: "hi", bytes: 2 });
  });

  it("refuses clipboard queries", () => {
    assert.deepEqual(parseOsc52("c;?"), { kind: "query" });
    assert.deepEqual(parseOsc52("p;?"), { kind: "query" });
  });

  it("rejects malformed payloads", () => {
    assert.deepEqual(parseOsc52("c"), { kind: "invalid" });
    assert.deepEqual(parseOsc52("c;"), { kind: "invalid" });
    assert.deepEqual(parseOsc52("c;not base64!"), { kind: "invalid" });
    assert.deepEqual(parseOsc52("c;a"), { kind: "invalid" });
    assert.deepEqual(parseOsc52(`zz;${b64("x")}`), { kind: "invalid" });
  });

  it("caps the size before decoding", () => {
    const big = "A".repeat(4 * 300);
    const r = parseOsc52(`c;${big}`, 800);
    assert.equal(r.kind, "too-large");
    assert.equal(r.kind === "too-large" && r.bytes, 900);
    assert.equal(parseOsc52(`c;${big}`, 900).kind, "write");
  });
});

describe("Osc52Gate", () => {
  it("off drops, always writes, ask asks", () => {
    const g = new Osc52Gate();
    assert.equal(g.decide("x", "off", 0), "drop");
    assert.equal(g.decide("x", "always", 0), "write");
    assert.equal(g.decide("x", "ask", 0), "ask");
  });

  it("drops the same text written again within the dedupe window", () => {
    const g = new Osc52Gate();
    g.noteWritten("x", 0);
    assert.equal(g.decide("x", "always", 1), "drop");
    assert.equal(g.decide("y", "always", 1), "write");
    assert.equal(g.decide("x", "always", OSC52_DEDUPE_MS), "write");
  });

  it("mutes asking after a deny", () => {
    const g = new Osc52Gate();
    g.noteDenied(0);
    assert.equal(g.decide("x", "ask", 1), "drop");
    assert.equal(g.decide("x", "ask", OSC52_DENY_MUTE_MS), "ask");
  });
});

describe("normalizeOsc52Mode / formatByteSize", () => {
  it("falls back to ask", () => {
    assert.equal(normalizeOsc52Mode("always"), "always");
    assert.equal(normalizeOsc52Mode("read"), "ask");
    assert.equal(normalizeOsc52Mode(undefined), "ask");
  });
  it("formats sizes", () => {
    assert.equal(formatByteSize(512), "512 B");
    assert.equal(formatByteSize(1536), "1.5 KB");
    assert.equal(formatByteSize(1024 * 1024), "1.0 MB");
  });
});

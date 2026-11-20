import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendPtyChunk,
  clampUtf16SliceEnd,
  createPtyChunkBuffer,
  materializePtyChunk,
  ptyTrimKeepChars,
  takePtyChunkPrefix,
  trimPtyChunkBuffer,
} from "./pty-chunk-buffer.js";

describe("pty-chunk-buffer", () => {
  it("appends without joining until the text is read", () => {
    const buf = createPtyChunkBuffer();
    assert.equal(appendPtyChunk(buf, "hello ", 100), null);
    assert.equal(appendPtyChunk(buf, "world", 100), null);
    assert.equal(buf.pieces.length, 2);
    assert.equal(buf.length, 11);
    assert.equal(materializePtyChunk(buf), "hello world");
    assert.equal(buf.pieces.length, 1);
  });

  it("keeps only the tail when the cap is exceeded", () => {
    const buf = createPtyChunkBuffer();
    appendPtyChunk(buf, "abcdefghij", 8);
    const trimmed = appendPtyChunk(buf, "0123456789", 8);
    // Trims to 75% of the cap, not to the cap itself.
    assert.equal(trimmed, "456789");
    assert.equal(materializePtyChunk(buf), "456789");
  });

  it("leaves headroom so appends just under the cap do not trim again", () => {
    const max = 100;
    const buf = createPtyChunkBuffer();
    appendPtyChunk(buf, "x".repeat(max), max);
    const first = appendPtyChunk(buf, "y", max);
    assert.equal(first?.length, ptyTrimKeepChars(max));
    assert.equal(buf.length, 75);
    // 75 -> 100 stays within the cap: cheap appends only, no trim/rewrite.
    for (let i = 0; i < max - 75; i++) {
      assert.equal(appendPtyChunk(buf, "z", max), null);
    }
    assert.equal(buf.length, max);
    const again = appendPtyChunk(buf, "!", max);
    assert.equal(again?.length, 75);
    assert.ok(again?.endsWith("z!"));
  });

  it("trimPtyChunkBuffer is a no-op at or under the cap", () => {
    const buf = createPtyChunkBuffer();
    appendPtyChunk(buf, "abcdef", Number.POSITIVE_INFINITY);
    assert.equal(trimPtyChunkBuffer(buf, 6), null);
    assert.equal(trimPtyChunkBuffer(buf, 4), "def");
    assert.equal(buf.length, 3);
  });

  it("never trims an uncapped buffer", () => {
    const buf = createPtyChunkBuffer();
    assert.equal(appendPtyChunk(buf, "a".repeat(1000), Number.POSITIVE_INFINITY), null);
    assert.equal(buf.length, 1000);
  });

  it("splits a prefix off the front without dropping the tail", () => {
    const buf = createPtyChunkBuffer();
    appendPtyChunk(buf, "hello", 100);
    appendPtyChunk(buf, "world", 100);
    assert.equal(takePtyChunkPrefix(buf, 7), "hellowo");
    assert.equal(buf.length, 3);
    assert.equal(materializePtyChunk(buf), "rld");
  });

  it("does not split a surrogate pair across a slice", () => {
    const emoji = "😀";
    assert.equal(emoji.length, 2);
    const text = `x${emoji}y`;
    const end = clampUtf16SliceEnd(text, 0, 2);
    assert.equal(end, 1);
    const buf = createPtyChunkBuffer();
    appendPtyChunk(buf, text, 100);
    assert.equal(takePtyChunkPrefix(buf, 2), `x${emoji}`);
    assert.equal(materializePtyChunk(buf), "y");
  });
});

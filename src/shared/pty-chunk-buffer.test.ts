import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendPtyChunk,
  clampUtf16SliceEnd,
  createPtyChunkBuffer,
  materializePtyChunk,
  takePtyChunkPrefix,
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
    appendPtyChunk(buf, "abcdefghij", 6);
    const trimmed = appendPtyChunk(buf, "0123456789", 6);
    assert.equal(trimmed, "456789");
    assert.equal(materializePtyChunk(buf), "456789");
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

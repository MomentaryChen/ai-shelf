import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PtyOwnership } from "./pty-ownership.js";

describe("PtyOwnership", () => {
  it("lets every sender control a session nobody owns", () => {
    const o = new PtyOwnership();
    assert.equal(o.canControl("s1", 1), true);
    assert.equal(o.canControl("s1", 2), true);
    assert.equal(o.ownerOf("s1"), null);
  });

  it("restricts a claimed session to its owner", () => {
    const o = new PtyOwnership();
    o.claim("s1", 7);
    assert.equal(o.canControl("s1", 7), true);
    assert.equal(o.canControl("s1", 3), false);
    assert.equal(o.canControl("s2", 3), true);
    assert.equal(o.ownerOf("s1"), 7);
  });

  it("hands control over when another window claims it", () => {
    const o = new PtyOwnership();
    o.claim("s1", 7);
    o.claim("s1", 9);
    assert.equal(o.canControl("s1", 7), false);
    assert.equal(o.canControl("s1", 9), true);
  });

  it("release reopens the session to everyone", () => {
    const o = new PtyOwnership();
    o.claim("s1", 7);
    o.release("s1");
    assert.equal(o.canControl("s1", 3), true);
  });

  it("release with an owner id is a no-op when someone else owns it", () => {
    const o = new PtyOwnership();
    o.claim("s1", 9);
    o.release("s1", 7);
    assert.equal(o.ownerOf("s1"), 9);
    o.release("s1", 9);
    assert.equal(o.ownerOf("s1"), null);
  });

  it("releaseAllFor clears only that owner's sessions", () => {
    const o = new PtyOwnership();
    o.claim("a", 1);
    o.claim("b", 1);
    o.claim("c", 2);
    assert.deepEqual(o.releaseAllFor(1).sort(), ["a", "b"]);
    assert.equal(o.ownerOf("a"), null);
    assert.equal(o.ownerOf("b"), null);
    assert.equal(o.ownerOf("c"), 2);
  });
});

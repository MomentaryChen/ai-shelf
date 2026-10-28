import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeFlowPathSegment, parseFlowDocument } from "./flow-parse.js";

describe("isSafeFlowPathSegment", () => {
  it("accepts normal ids", () => {
    for (const id of ["daily-standup", "weekly_digest.v2", "每日報告", "__draft__"]) {
      assert.equal(isSafeFlowPathSegment(id), true, id);
    }
  });

  it("rejects traversal, separators and reserved characters", () => {
    for (const id of ["", ".", "..", "../x", "a/b", "a\\b", "..\\x", "a..b", "c:x", "a*b", "x.", " x", "a\u0000b"]) {
      assert.equal(isSafeFlowPathSegment(id), false, JSON.stringify(id));
    }
  });
});

describe("parseFlowDocument id validation", () => {
  it("rejects a flow whose id escapes the flows directory", () => {
    const parsed = parseFlowDocument("---\nid: ../x\n---\n\nbody\n", "x.flow.md", "x.flow.md");
    assert.ok("error" in parsed);
  });
});

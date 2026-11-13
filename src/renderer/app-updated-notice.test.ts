import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { releaseNotesUrl, resolveUpdatedNotice } from "./app-updated-notice";

describe("resolveUpdatedNotice", () => {
  it("announces the new version after an update", () => {
    assert.equal(resolveUpdatedNotice("1.4.0", "1.5.0"), "1.5.0");
  });

  it("stays quiet when the version is unchanged", () => {
    assert.equal(resolveUpdatedNotice("1.5.0", "1.5.0"), null);
  });

  it("stays quiet on first launch (nothing recorded yet)", () => {
    assert.equal(resolveUpdatedNotice(null, "1.5.0"), null);
    assert.equal(resolveUpdatedNotice("  ", "1.5.0"), null);
  });

  it("ignores placeholder current versions", () => {
    assert.equal(resolveUpdatedNotice("1.4.0", null), null);
    assert.equal(resolveUpdatedNotice("1.4.0", "unknown"), null);
    assert.equal(resolveUpdatedNotice("1.4.0", "0.0.0"), null);
  });
});

describe("releaseNotesUrl", () => {
  it("points at the tagged GitHub release", () => {
    assert.equal(
      releaseNotesUrl("1.5.0"),
      "https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.5.0",
    );
  });
});

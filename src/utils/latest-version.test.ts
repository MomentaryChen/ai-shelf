import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { npmRegistryLatestUrl } from "./latest-version.js";

describe("npmRegistryLatestUrl", () => {
  it("escapes the scope slash but keeps the @", () => {
    assert.equal(
      npmRegistryLatestUrl("@anthropic-ai/claude-code"),
      "https://registry.npmjs.org/@anthropic-ai%2fclaude-code/latest",
    );
  });

  it("leaves unscoped names unchanged", () => {
    assert.equal(npmRegistryLatestUrl("ai-shelf"), "https://registry.npmjs.org/ai-shelf/latest");
  });
});

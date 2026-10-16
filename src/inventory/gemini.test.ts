import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { detectGeminiAuth, readGeminiSelectedAuthType } from "./gemini.js";

function geminiDir(withCreds: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "aishelf-gemini-"));
  if (withCreds) writeFileSync(join(dir, "oauth_creds.json"), '{"placeholder":true}', "utf-8");
  return dir;
}

describe("readGeminiSelectedAuthType", () => {
  it("prefers nested security.auth.selectedAuthType", () => {
    assert.equal(
      readGeminiSelectedAuthType({
        selectedAuthType: "gemini-api-key",
        security: { auth: { selectedAuthType: "oauth-personal" } },
      }),
      "oauth-personal",
    );
  });

  it("falls back to the legacy top-level key", () => {
    assert.equal(readGeminiSelectedAuthType({ selectedAuthType: "vertex-ai" }), "vertex-ai");
    assert.equal(readGeminiSelectedAuthType({}), undefined);
    assert.equal(readGeminiSelectedAuthType(null), undefined);
  });
});

describe("detectGeminiAuth", () => {
  it("is ok with an API key in env", () => {
    assert.equal(
      detectGeminiAuth({ geminiDir: geminiDir(false), env: { GEMINI_API_KEY: "x" } }),
      "ok",
    );
  });

  it("detects OAuth login from oauth_creds.json presence", () => {
    assert.equal(
      detectGeminiAuth({ geminiDir: geminiDir(true), selectedAuthType: "oauth-personal", env: {} }),
      "ok",
    );
    assert.equal(detectGeminiAuth({ geminiDir: geminiDir(true), env: {} }), "ok");
  });

  it("is missing when OAuth is selected but no credentials exist", () => {
    assert.equal(
      detectGeminiAuth({
        geminiDir: geminiDir(false),
        selectedAuthType: "oauth-personal",
        env: {},
      }),
      "missing",
    );
    assert.equal(detectGeminiAuth({ geminiDir: geminiDir(false), env: {} }), "missing");
  });

  it("requires a key when api-key auth is selected", () => {
    assert.equal(
      detectGeminiAuth({ geminiDir: geminiDir(true), selectedAuthType: "gemini-api-key", env: {} }),
      "missing",
    );
  });

  it("checks project + location for vertex-ai", () => {
    const dir = geminiDir(false);
    assert.equal(
      detectGeminiAuth({ geminiDir: dir, selectedAuthType: "vertex-ai", env: {} }),
      "missing",
    );
    assert.equal(
      detectGeminiAuth({
        geminiDir: dir,
        selectedAuthType: "vertex-ai",
        env: { GOOGLE_CLOUD_PROJECT: "p", GOOGLE_CLOUD_LOCATION: "us-central1" },
      }),
      "ok",
    );
  });
});

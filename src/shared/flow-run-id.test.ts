import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDirMatchesFlow } from "./flow-run-id.js";

describe("runDirMatchesFlow", () => {
  it("matches exact flow ids in current and legacy run names", () => {
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-review", "review"), true);
    assert.equal(runDirMatchesFlow("20260101-120000-review", "review"), true);
    assert.equal(
      runDirMatchesFlow("20260101-120000-ab12-multi-agent-review", "multi-agent-review"),
      true,
    );
  });

  it("does not let a suffix id claim another flow's runs", () => {
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-multi-agent-review", "review"), false);
    assert.equal(runDirMatchesFlow("20260101-120000-multi-agent-review", "review"), false);
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-review", "multi-agent-review"), false);
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-foo-review", "review"), false);
  });

  it("prefers the flowId recorded in state.json", () => {
    // Legacy name of flow `ab12-review` looks like a current run of `review`.
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-review", "review", "ab12-review"), false);
    assert.equal(
      runDirMatchesFlow("20260101-120000-ab12-review", "ab12-review", "ab12-review"),
      true,
    );
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-review", "review", "review"), true);
    // Blank state flowId falls back to structural matching.
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-review", "review", ""), true);
  });

  it("ignores malformed directory names", () => {
    assert.equal(runDirMatchesFlow("review", "review"), false);
    assert.equal(runDirMatchesFlow("-review", "review"), false);
    assert.equal(runDirMatchesFlow("tmp-review", "review"), false);
    assert.equal(runDirMatchesFlow("2026-01-01-review", "review"), false);
    assert.equal(runDirMatchesFlow("20260101-120000-", "review"), false);
    assert.equal(runDirMatchesFlow("20260101-120000-ab12-review", ""), false);
    assert.equal(runDirMatchesFlow("not-a-run", "review", "review"), false);
  });
});

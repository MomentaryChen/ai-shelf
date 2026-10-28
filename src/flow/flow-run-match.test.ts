import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { listRunDirNamesForFlow } from "./flow-run-match.js";

describe("listRunDirNamesForFlow", () => {
  const root = mkdtempSync(join(tmpdir(), "flow-run-match-"));
  after(() => rmSync(root, { recursive: true, force: true }));

  const mkRun = (name: string, flowId?: string) => {
    mkdirSync(join(root, name), { recursive: true });
    if (flowId !== undefined) {
      writeFileSync(join(root, name, "state.json"), JSON.stringify({ flowId }), "utf8");
    }
  };
  mkRun("20260101-120000-ab12-review", "review");
  mkRun("20260101-120001-cd34-multi-agent-review", "multi-agent-review");
  mkRun("20260101-120002-multi-agent-review"); // legacy, no state.json
  mkRun("20260101-120003-ef56-review"); // no state.json
  mkRun("20260101-120004-ab12-review-x", "ab12-review-x");
  mkRun("junk-review");
  writeFileSync(join(root, "20260101-120005-gh78-review"), "not a dir", "utf8");

  it("returns only runs of the exact flow", () => {
    assert.deepEqual(listRunDirNamesForFlow(root, "review").sort(), [
      "20260101-120000-ab12-review",
      "20260101-120003-ef56-review",
    ]);
    assert.deepEqual(listRunDirNamesForFlow(root, "multi-agent-review").sort(), [
      "20260101-120001-cd34-multi-agent-review",
      "20260101-120002-multi-agent-review",
    ]);
  });

  it("returns nothing for a missing runs root", () => {
    assert.deepEqual(listRunDirNamesForFlow(join(root, "missing"), "review"), []);
  });
});

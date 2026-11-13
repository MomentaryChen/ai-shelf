import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateTaskId,
  isSafeTaskId,
  parseTaskFile,
  serializeTaskFile,
  slugifyTaskName,
  taskFromLegacyFlow,
} from "./task-file.js";

describe("task ids", () => {
  it("rejects path segments and reserved names", () => {
    assert.equal(isSafeTaskId("weekly-review"), true);
    assert.equal(isSafeTaskId("../x"), false);
    assert.equal(isSafeTaskId("a/b"), false);
    assert.equal(isSafeTaskId("con"), false);
    assert.equal(isSafeTaskId(""), false);
  });

  it("slugifies ascii and falls back for CJK names", () => {
    assert.equal(slugifyTaskName("  Weekly PR Review! "), "weekly-pr-review");
    assert.equal(slugifyTaskName("每週整理"), "");
    assert.match(allocateTaskId("每週整理", new Set(), 1000), /^task-/);
  });

  it("allocates a free id", () => {
    assert.equal(allocateTaskId("Review", new Set(["review", "review-2"])), "review-3");
  });
});

describe("task file", () => {
  it("round-trips through serialize and parse", () => {
    const text = serializeTaskFile({
      id: "review",
      name: "Review: \"main\"",
      description: "desc",
      profileId: "p1",
      tool: "codex",
      prompt: "Line 1\nLine 2 with 'quotes' and $VARS",
    });
    const task = parseTaskFile(text, "fallback");
    assert.deepEqual(task, {
      id: "review",
      name: "Review: \"main\"",
      description: "desc",
      profileId: "p1",
      tool: "codex",
      prompt: "Line 1\nLine 2 with 'quotes' and $VARS",
    });
  });

  it("uses the file name when the id is unsafe or missing", () => {
    assert.equal(parseTaskFile("---\nid: ../evil\n---\nhi", "safe").id, "safe");
    assert.equal(parseTaskFile("just a prompt", "plain").prompt, "just a prompt");
  });
});

describe("legacy flow conversion", () => {
  it("keeps the steps and drops phase markers", () => {
    const flow = [
      "---",
      "id: daily-standup",
      "profile: work",
      "phases:",
      "  - id: gather",
      "---",
      "",
      "# Daily standup",
      "",
      "## Steps",
      "",
      "1. 【gather】Ask what I did.",
      "",
      "## 【polish】",
      "Rewrite it.",
    ].join("\n");
    const task = taskFromLegacyFlow(flow, "x");
    assert.ok(task);
    assert.equal(task.id, "daily-standup");
    assert.equal(task.name, "Daily standup");
    assert.equal(task.profileId, "work");
    assert.equal(task.prompt, "## Steps\n\n1. Ask what I did.\n\n## polish\nRewrite it.");
  });

  it("skips http runner flows and empty bodies", () => {
    assert.equal(taskFromLegacyFlow("---\nid: ping\nrunner: http\n---\nCheck", "ping"), null);
    assert.equal(taskFromLegacyFlow("---\nid: e\n---\n# Title only\n", "e"), null);
  });
});

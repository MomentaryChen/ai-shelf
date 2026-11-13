import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GroupLayoutSnapshotSchema } from "./group-layout.js";

describe("GroupLayoutSnapshotSchema panes", () => {
  const base = { defaultCwd: "", layout: null, updatedAt: "2026-01-01T00:00:00.000Z" };

  it("keeps a pane's agent session id", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const parsed = GroupLayoutSnapshotSchema.parse({
      ...base,
      panes: [{ tool: "claude", cwd: "/repo", agentSessionId: id }],
    });
    assert.equal(parsed.panes[0]?.agentSessionId, id);
  });

  it("keeps a pane's task id", () => {
    const parsed = GroupLayoutSnapshotSchema.parse({
      ...base,
      panes: [{ tool: "claude", cwd: "/repo", taskId: "review-branch" }],
    });
    assert.equal(parsed.panes[0]?.taskId, "review-branch");
  });

  it("still accepts panes saved before agent session ids existed", () => {
    const parsed = GroupLayoutSnapshotSchema.parse({
      ...base,
      panes: [{ tool: "claude", cwd: "" }],
    });
    assert.equal(parsed.panes[0]?.agentSessionId, undefined);
  });
});

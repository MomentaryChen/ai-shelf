import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strongestPaneAgentStatus } from "./pane-agent-state.js";

describe("strongestPaneAgentStatus", () => {
  it("returns null when nothing is active", () => {
    assert.equal(strongestPaneAgentStatus([]), null);
    assert.equal(strongestPaneAgentStatus(["idle", undefined, null]), null);
  });

  it("prefers waiting_input over stalled over running", () => {
    assert.equal(strongestPaneAgentStatus(["idle", "running"]), "running");
    assert.equal(strongestPaneAgentStatus(["running", "stalled", "running"]), "stalled");
    assert.equal(strongestPaneAgentStatus(["stalled", "waiting_input", "running"]), "waiting_input");
  });
});

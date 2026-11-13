import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPaneAgentOutput,
  applyPaneAgentUserInput,
  applyPaneCommandRunning,
  createPaneAgentState,
  DEFAULT_PANE_AGENT_OPTIONS,
  strongestPaneAgentStatus,
  tickPaneAgentState,
} from "./pane-agent-state.js";

describe("strongestPaneAgentStatus", () => {
  it("returns null when nothing is active", () => {
    assert.equal(strongestPaneAgentStatus([]), null);
    assert.equal(strongestPaneAgentStatus(["idle", undefined, null]), null);
  });

  it("prefers waiting_input over stalled over running", () => {
    assert.equal(strongestPaneAgentStatus(["idle", "running"]), "running");
    assert.equal(strongestPaneAgentStatus(["running", "stalled", "running"]), "stalled");
    assert.equal(
      strongestPaneAgentStatus(["stalled", "waiting_input", "running"]),
      "waiting_input",
    );
  });
});

describe("classify with OSC 133 command state", () => {
  const opts = { ...DEFAULT_PANE_AGENT_OPTIONS, stallTimeoutMs: 120_000 };
  const t0 = 1_000_000;
  const base = { ...createPaneAgentState(t0), lastOutputAt: t0 };

  it("keeps a quiet command running past the stall timeout", () => {
    const s = applyPaneCommandRunning(base, true, t0, opts);
    assert.equal(s.status, "running");
    assert.equal(tickPaneAgentState(s, t0 + 600_000, opts).status, "running");
  });

  it("is idle at the prompt even with busy-looking output or a ❯ prompt", () => {
    let s = applyPaneCommandRunning(base, true, t0, opts);
    s = applyPaneCommandRunning(s, false, t0 + 10_000, opts);
    assert.equal(s.status, "idle");
    assert.equal(s.lastRunningSpellMs, 10_000);
    s = applyPaneAgentOutput(s, "still running... thinking\r\n~/src ❯ ", t0 + 10_001, opts);
    assert.equal(s.status, "idle");
    assert.equal(applyPaneAgentUserInput(s, t0 + 10_002, opts).status, "idle");
  });

  it("waiting_input wins while a command runs", () => {
    let s = applyPaneCommandRunning(base, true, t0, opts);
    s = applyPaneAgentOutput(s, "Overwrite file? (y/n) ", t0 + 1, opts);
    assert.equal(s.status, "waiting_input");
  });

  it("falls back to output heuristics when unknown (agent tool panes)", () => {
    let s = applyPaneAgentOutput(base, "hello", t0, opts);
    assert.equal(s.commandRunning, null);
    assert.equal(s.status, "running");
    s = tickPaneAgentState(s, t0 + 20_000, opts);
    assert.equal(s.status, "idle");
  });
});

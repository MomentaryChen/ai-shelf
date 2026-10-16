import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextPhaseIdAfterSuccess,
  phaseRetryLimit,
  resolvePhaseBranch,
} from "../shared/flow-orchestration.js";
import type { FlowPhaseDef } from "../shared/flow-types.js";
import { maxPhaseVisits, phaseLoopError } from "./flow-loop-guard.js";

type DriveResult = { status: "completed" | "failed"; error: string | null; calls: string[] };

/**
 * Mirrors the visit / retry / branch control flow of `executeOrchestratedFlowRun`
 * (gates omitted) with a fake executor, so loop handling can be tested without
 * spawning agents.
 */
function drive(phases: FlowPhaseDef[], execute: (phaseId: string) => boolean): DriveResult {
  const calls: string[] = [];
  let currentId: string | null = phases[0]?.id ?? null;
  let phaseVisits = 0;
  while (currentId) {
    phaseVisits += 1;
    const loopError = phaseLoopError(phaseVisits, phases.length, currentId);
    if (loopError) return { status: "failed", error: loopError, calls };
    const phase = phases.find((p) => p.id === currentId);
    if (!phase) return { status: "failed", error: `Unknown phase: ${currentId}`, calls };

    const maxAttempts = 1 + phaseRetryLimit(phase);
    let succeeded = false;
    for (let attempt = 1; attempt <= maxAttempts && !succeeded; attempt += 1) {
      calls.push(phase.id);
      succeeded = execute(phase.id);
    }
    if (!succeeded) {
      const branch = resolvePhaseBranch(phase.onFail, "fail");
      if (branch === "fail") return { status: "failed", error: "failed", calls };
      currentId = branch === "skip" ? nextPhaseIdAfterSuccess(phases, phase.id) : branch;
      continue;
    }
    currentId = nextPhaseIdAfterSuccess(phases, phase.id);
  }
  return { status: "completed", error: null, calls };
}

describe("flow-loop-guard", () => {
  it("allows up to phases * 3 visits", () => {
    assert.equal(maxPhaseVisits(2), 6);
    assert.equal(maxPhaseVisits(0), 3);
    assert.equal(phaseLoopError(6, 2, "a"), null);
    const err = phaseLoopError(7, 2, "a");
    assert.ok(err);
    assert.match(err, /Phase loop detected/);
    assert.match(err, /"a"/);
    assert.match(err, /#7/);
  });

  it("fails an A -> B -> A next: cycle after a bounded number of executions", () => {
    const phases: FlowPhaseDef[] = [
      { id: "a", label: "A", next: "b" },
      { id: "b", label: "B", next: "a" },
    ];
    const result = drive(phases, () => true);
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /Phase loop detected/);
    assert.equal(result.calls.length, maxPhaseVisits(phases.length));
    assert.deepEqual(result.calls, ["a", "b", "a", "b", "a", "b"]);
  });

  it("fails an on_fail: cycle back to an earlier phase", () => {
    const phases: FlowPhaseDef[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B", onFail: "a" },
    ];
    const result = drive(phases, (id) => id === "a");
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /Phase loop detected/);
    assert.equal(result.calls.length, 6);
  });

  it("does not count configured retries as loop visits", () => {
    const phases: FlowPhaseDef[] = [
      { id: "a", label: "A", retry: 10 },
      { id: "b", label: "B" },
    ];
    let aFailures = 10;
    const result = drive(phases, (id) => (id === "a" ? aFailures-- <= 0 : true));
    assert.equal(result.status, "completed");
    assert.equal(result.calls.filter((id) => id === "a").length, 11);
  });

  it("allows a bounded on_fail: rework loop that eventually succeeds", () => {
    const phases: FlowPhaseDef[] = [
      { id: "draft", label: "Draft", retry: 2 },
      { id: "review", label: "Review", retry: 2, onFail: "draft" },
    ];
    let reviewFailures = 3; // first review visit fails all 3 attempts, second passes
    const result = drive(phases, (id) => (id === "review" ? reviewFailures-- <= 0 : true));
    assert.equal(result.status, "completed");
    assert.equal(result.error, null);
  });
});

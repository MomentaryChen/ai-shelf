import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FLOW_RUN_STATE_SCHEMA, type FlowRunState } from "../shared/flow-types.js";
import {
  INTERRUPTED_RUN_ERROR,
  isNonTerminalRunStatus,
  markRunInterrupted,
  reconcileStaleRuns,
} from "./run-reconcile.js";

function makeState(runId: string, overrides: Partial<FlowRunState> = {}): FlowRunState {
  return {
    schema: FLOW_RUN_STATE_SCHEMA,
    runId,
    flowId: "demo",
    status: "running",
    startedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:01.000Z",
    currentPhaseId: "p2",
    progress: { completed: 1, total: 3, percent: 33 },
    phases: [
      { id: "p1", label: "One", status: "done", startedAt: null, completedAt: null, message: null },
      {
        id: "p2",
        label: "Two",
        status: "running",
        startedAt: null,
        completedAt: null,
        message: null,
      },
      {
        id: "p3",
        label: "Three",
        status: "pending",
        startedAt: null,
        completedAt: null,
        message: null,
      },
    ],
    outputPath: null,
    error: null,
    logPath: "events.jsonl",
    costUsd: 0.5,
    ...overrides,
  };
}

function writeRun(root: string, state: FlowRunState): string {
  const dir = join(root, state.runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify(state), "utf8");
  return dir;
}

function readState(root: string, runId: string): FlowRunState {
  return JSON.parse(readFileSync(join(root, runId, "state.json"), "utf8")) as FlowRunState;
}

const NOW = new Date("2026-10-16T12:00:00.000Z");

describe("run-reconcile", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aishelf-runs-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("classifies non-terminal statuses", () => {
    assert.equal(isNonTerminalRunStatus("running"), true);
    assert.equal(isNonTerminalRunStatus("pending"), true);
    assert.equal(isNonTerminalRunStatus("waiting_approval"), true);
    assert.equal(isNonTerminalRunStatus("completed"), false);
    assert.equal(isNonTerminalRunStatus("failed"), false);
    assert.equal(isNonTerminalRunStatus("cancelled"), false);
  });

  it("marks a stale running run as failed and preserves other fields", () => {
    const dir = writeRun(root, makeState("r1"));
    const result = reconcileStaleRuns(root, { now: () => NOW });
    assert.deepEqual(result, ["r1"]);

    const s = readState(root, "r1");
    assert.equal(s.status, "failed");
    assert.equal(s.error, INTERRUPTED_RUN_ERROR);
    assert.equal(s.currentPhaseId, null);
    assert.equal(s.completedAt, NOW.toISOString());
    assert.equal(s.updatedAt, NOW.toISOString());
    assert.equal(s.startedAt, "2026-10-01T00:00:00.000Z");
    assert.equal(s.costUsd, 0.5);
    assert.deepEqual(
      s.phases.map((p) => p.status),
      ["done", "failed", "skipped"],
    );
    assert.deepEqual(s.progress, { completed: 2, total: 3, percent: 67 });

    const events = readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n");
    assert.equal(events.length, 1);
    assert.equal(JSON.parse(events[0]!).type, "run.failed");
  });

  it("reconciles pending and waiting_approval runs too", () => {
    writeRun(root, makeState("r-pending", { status: "pending" }));
    writeRun(root, makeState("r-gate", { status: "waiting_approval", pendingGatePhaseId: "p2" }));
    const result = reconcileStaleRuns(root, { now: () => NOW }).sort();
    assert.deepEqual(result, ["r-gate", "r-pending"]);
    assert.equal(readState(root, "r-gate").pendingGatePhaseId, null);
  });

  it("leaves terminal, active, and live-owner runs untouched", () => {
    writeRun(root, makeState("done", { status: "completed" }));
    writeRun(root, makeState("cancelled", { status: "cancelled" }));
    writeRun(root, makeState("active"));
    writeRun(root, makeState("cli-owned", { ownerPid: 424242 }));
    writeRun(root, makeState("dead-owner", { ownerPid: 434343 }));

    const result = reconcileStaleRuns(root, {
      now: () => NOW,
      isActive: (id) => id === "active",
      isPidAlive: (pid) => pid === 424242,
    });
    assert.deepEqual(result, ["dead-owner"]);
    assert.equal(readState(root, "done").status, "completed");
    assert.equal(readState(root, "cancelled").status, "cancelled");
    assert.equal(readState(root, "active").status, "running");
    assert.equal(readState(root, "cli-owned").status, "running");
    assert.equal(readState(root, "dead-owner").status, "failed");
  });

  it("skips corrupt state files and missing runs dir", () => {
    mkdirSync(join(root, "bad"));
    writeFileSync(join(root, "bad", "state.json"), "{not json", "utf8");
    assert.deepEqual(reconcileStaleRuns(root, { now: () => NOW }), []);
    assert.deepEqual(reconcileStaleRuns(join(root, "missing")), []);
  });

  it("markRunInterrupted keeps an existing completedAt", () => {
    const s = markRunInterrupted(
      makeState("x", { completedAt: "2026-10-02T00:00:00.000Z" }),
      NOW.toISOString(),
    );
    assert.equal(s.completedAt, "2026-10-02T00:00:00.000Z");
  });
});

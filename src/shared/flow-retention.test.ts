import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveFlowRunRetention,
  runIdTimestamp,
  selectRunsToPrune,
  type FlowRunRecord,
} from "./flow-retention.js";

const NOW = new Date("2026-07-01T00:00:00.000Z");

function run(
  runId: string,
  daysAgo: number,
  status: FlowRunRecord["status"] = "completed",
): FlowRunRecord {
  return {
    runId,
    startedAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    status,
  };
}

describe("flow-retention", () => {
  it("keeps the newest maxRuns runs", () => {
    const runs = [run("r1", 4), run("r2", 3), run("r3", 2), run("r4", 1)];
    assert.deepEqual(selectRunsToPrune(runs, { maxRuns: 2, maxAgeDays: null }, NOW).sort(), [
      "r1",
      "r2",
    ]);
  });

  it("deletes runs older than maxAgeDays", () => {
    const runs = [run("old", 10), run("mid", 5), run("new", 1)];
    assert.deepEqual(selectRunsToPrune(runs, { maxRuns: null, maxAgeDays: 7 }, NOW), ["old"]);
  });

  it("never deletes live runs or kept ids, but counts them toward maxRuns", () => {
    const runs = [run("a", 3, "running"), run("b", 2), run("c", 1), run("d", 0)];
    const doomed = selectRunsToPrune(runs, { maxRuns: 1, maxAgeDays: null }, NOW, new Set(["c"]));
    assert.deepEqual(doomed, ["b"]);
  });

  it("is a no-op without limits", () => {
    assert.deepEqual(
      selectRunsToPrune([run("a", 400)], { maxRuns: null, maxAgeDays: null }, NOW),
      [],
    );
    assert.deepEqual(selectRunsToPrune([run("a", 400)], { maxRuns: 0, maxAgeDays: -1 }, NOW), []);
  });

  it("falls back to the run id timestamp when startedAt is missing", () => {
    const ts = runIdTimestamp("20260115-093000-ab12-weekly-digest");
    assert.ok(ts);
    assert.equal(ts.getFullYear(), 2026);
    assert.equal(ts.getMonth(), 0);
    assert.equal(ts.getHours(), 9);
    const doomed = selectRunsToPrune(
      [{ runId: "20260115-093000-ab12-x", startedAt: null, status: null }],
      { maxRuns: null, maxAgeDays: 30 },
      NOW,
    );
    assert.deepEqual(doomed, ["20260115-093000-ab12-x"]);
  });

  it("lets per-flow overrides win field by field", () => {
    assert.deepEqual(
      resolveFlowRunRetention({ maxRuns: 200, maxAgeDays: null }, { maxAgeDays: 14 }),
      { maxRuns: 200, maxAgeDays: 14 },
    );
    assert.deepEqual(
      resolveFlowRunRetention({ maxRuns: 200, maxAgeDays: 30 }, { maxRuns: 5, maxAgeDays: null }),
      { maxRuns: 5, maxAgeDays: 30 },
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findDependencyCycle,
  findGraphCycle,
  flowUsesDagScheduling,
  readyDagPhaseIds,
  resolvePhaseDependencies,
} from "./flow-dag.js";
import type { FlowPhaseDef, FlowPhaseStatus } from "./flow-types.js";

function phase(id: string, dependsOn?: string[]): FlowPhaseDef {
  return dependsOn === undefined ? { id, label: id } : { id, label: id, dependsOn };
}

describe("flow-dag", () => {
  it("detects DAG mode only when a phase declares depends_on", () => {
    assert.equal(flowUsesDagScheduling([phase("a"), phase("b")]), false);
    assert.equal(flowUsesDagScheduling([phase("a"), phase("b", [])]), true);
  });

  it("defaults missing depends_on to the previous phase; [] is a root", () => {
    const deps = resolvePhaseDependencies([
      phase("a"),
      phase("b", []),
      phase("c"),
      phase("d", ["a", "c", "a"]),
    ]);
    assert.deepEqual(deps.get("a"), []);
    assert.deepEqual(deps.get("b"), []);
    assert.deepEqual(deps.get("c"), ["b"]);
    assert.deepEqual(deps.get("d"), ["a", "c"]);
  });

  it("reports ready phases whose dependencies are done or skipped", () => {
    const phases = [phase("a"), phase("b", []), phase("c", ["a", "b"])];
    const status = new Map<string, FlowPhaseStatus>([
      ["a", "pending"],
      ["b", "pending"],
      ["c", "pending"],
    ]);
    assert.deepEqual(readyDagPhaseIds(phases, status), ["a", "b"]);

    status.set("a", "done");
    status.set("b", "running");
    assert.deepEqual(readyDagPhaseIds(phases, status), []);

    status.set("b", "skipped");
    assert.deepEqual(readyDagPhaseIds(phases, status), ["c"]);
  });

  it("finds dependency cycles and reports them in run order", () => {
    assert.equal(findDependencyCycle([phase("a", []), phase("b", ["a"])]), null);
    const cycle = findDependencyCycle([phase("a", ["c"]), phase("b", ["a"]), phase("c", ["b"])]);
    assert.ok(cycle);
    assert.equal(cycle[0], cycle[cycle.length - 1]);
    assert.equal(cycle.length, 4);
  });

  it("findGraphCycle ignores edges to unknown nodes", () => {
    const edges = new Map<string, string[]>([
      ["a", ["b", "ghost"]],
      ["b", []],
    ]);
    assert.equal(findGraphCycle(edges), null);
    edges.set("b", ["a"]);
    assert.deepEqual(findGraphCycle(edges), ["a", "b", "a"]);
  });
});

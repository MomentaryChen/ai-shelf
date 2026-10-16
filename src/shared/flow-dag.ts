import type { FlowPhaseDef, FlowPhaseStatus } from "./flow-types.js";

/** Default cap on concurrently running phases in DAG mode (`max_parallel`). */
export const FLOW_DEFAULT_MAX_PARALLEL = 4;

/** True when any phase declares `depends_on` — the run uses dependency (DAG) scheduling. */
export function flowUsesDagScheduling(phases: FlowPhaseDef[]): boolean {
  return phases.some((p) => Array.isArray(p.dependsOn));
}

/**
 * Effective dependencies per phase id. A phase without `depends_on` depends on the
 * previous phase in the list (so legacy sequential order is preserved); `depends_on: []`
 * marks a root that can start immediately.
 */
export function resolvePhaseDependencies(phases: FlowPhaseDef[]): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  phases.forEach((phase, index) => {
    if (Array.isArray(phase.dependsOn)) {
      deps.set(phase.id, [...new Set(phase.dependsOn)]);
    } else if (index > 0) {
      deps.set(phase.id, [phases[index - 1]!.id]);
    } else {
      deps.set(phase.id, []);
    }
  });
  return deps;
}

/**
 * Find one cycle in a directed graph (`node → nodes it points to`).
 * Returns the cycle path with the first node repeated at the end (`a → b → a`), or null.
 * Edges to unknown nodes are ignored.
 */
export function findGraphCycle(edges: Map<string, string[]>): string[] | null {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of edges.keys()) color.set(node, WHITE);

  for (const start of edges.keys()) {
    if (color.get(start) !== WHITE) continue;
    // Iterative DFS keeps deep graphs off the call stack.
    const stack: { node: string; next: number }[] = [{ node: start, next: 0 }];
    const path: string[] = [start];
    color.set(start, GREY);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const targets = edges.get(top.node) ?? [];
      if (top.next >= targets.length) {
        color.set(top.node, BLACK);
        stack.pop();
        path.pop();
        continue;
      }
      const target = targets[top.next]!;
      top.next += 1;
      if (!edges.has(target)) continue;
      const c = color.get(target);
      if (c === GREY) {
        const from = path.indexOf(target);
        return [...path.slice(from), target];
      }
      if (c === WHITE) {
        color.set(target, GREY);
        stack.push({ node: target, next: 0 });
        path.push(target);
      }
    }
  }
  return null;
}

/** Cycle among `depends_on` edges (reported in execution order, e.g. `a → b → a`). */
export function findDependencyCycle(phases: FlowPhaseDef[]): string[] | null {
  const deps = resolvePhaseDependencies(phases);
  // deps point child → parent; reverse so the reported path reads in run order.
  const cycle = findGraphCycle(deps);
  return cycle ? [...cycle].reverse() : null;
}

const RESOLVED: ReadonlySet<FlowPhaseStatus> = new Set<FlowPhaseStatus>(["done", "skipped"]);

/** Pending phases whose dependencies are all done/skipped, in definition order. */
export function readyDagPhaseIds(
  phases: FlowPhaseDef[],
  statusById: ReadonlyMap<string, FlowPhaseStatus>,
): string[] {
  const deps = resolvePhaseDependencies(phases);
  const ready: string[] = [];
  for (const phase of phases) {
    if ((statusById.get(phase.id) ?? "pending") !== "pending") continue;
    const parents = deps.get(phase.id) ?? [];
    if (parents.every((id) => RESOLVED.has(statusById.get(id) ?? "pending"))) {
      ready.push(phase.id);
    }
  }
  return ready;
}

/** Direct upstream phase ids for a phase (DAG mode). */
export function phaseDependencies(phases: FlowPhaseDef[], phaseId: string): string[] {
  return resolvePhaseDependencies(phases).get(phaseId) ?? [];
}

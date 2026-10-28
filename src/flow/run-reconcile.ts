import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FlowRunState, FlowRunStatus } from "../shared/flow-types.js";

export const INTERRUPTED_RUN_ERROR = "Interrupted: app exited while run was in progress";

const NON_TERMINAL_STATUSES: ReadonlySet<FlowRunStatus> = new Set([
  "pending",
  "running",
  "waiting_approval",
]);

export function isNonTerminalRunStatus(status: FlowRunStatus | undefined): boolean {
  return status != null && NON_TERMINAL_STATUSES.has(status);
}

/** True when a process with this pid exists (signal 0 only probes, never kills). */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Rewrite a non-terminal run state as failed/interrupted, preserving every other field. */
export function markRunInterrupted(state: FlowRunState, now: string): FlowRunState {
  const phases = state.phases.map((phase) => {
    if (phase.status === "running" || phase.status === "waiting_approval") {
      return { ...phase, status: "failed" as const, completedAt: now, message: "Interrupted" };
    }
    if (phase.status === "pending") {
      return { ...phase, status: "skipped" as const };
    }
    return phase;
  });
  const total = phases.length;
  const completed = phases.filter((p) => p.status === "done" || p.status === "skipped").length;
  return {
    ...state,
    status: "failed",
    error: INTERRUPTED_RUN_ERROR,
    currentPhaseId: null,
    pendingGatePhaseId: null,
    phases,
    progress: {
      completed,
      total,
      percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    },
    updatedAt: now,
    completedAt: state.completedAt ?? now,
  };
}

export type ReconcileStaleRunsOptions = {
  /** Runs owned by this process right now (never touched). */
  isActive?: (runId: string) => boolean;
  /** Liveness probe for `ownerPid`; runs owned by another live process (e.g. headless CLI) are skipped. */
  isPidAlive?: (pid: number) => boolean;
  now?: () => Date;
};

/**
 * Scan `<runsDir>/<runId>/state.json` for runs left in a non-terminal status by a
 * process that no longer exists and rewrite them as failed. Returns the reconciled run ids.
 */
export function reconcileStaleRuns(
  runsDir: string,
  options: ReconcileStaleRunsOptions = {},
): string[] {
  if (!existsSync(runsDir)) return [];
  const isActive = options.isActive ?? (() => false);
  const pidAlive = options.isPidAlive ?? isPidAlive;
  const now = options.now ?? (() => new Date());
  const reconciled: string[] = [];

  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runDir = join(runsDir, entry.name);
    const statePath = join(runDir, "state.json");
    if (!existsSync(statePath)) continue;

    let state: FlowRunState;
    try {
      state = JSON.parse(readFileSync(statePath, "utf8")) as FlowRunState;
    } catch {
      continue;
    }
    if (!state || !isNonTerminalRunStatus(state.status)) continue;
    const runId = state.runId || entry.name;
    if (isActive(runId)) continue;
    if (
      typeof state.ownerPid === "number" &&
      state.ownerPid !== process.pid &&
      pidAlive(state.ownerPid)
    ) {
      continue;
    }

    const stamp = now().toISOString();
    const next = markRunInterrupted(state, stamp);
    try {
      writeFileSync(statePath, JSON.stringify(next, null, 2), "utf8");
      appendFileSync(
        join(runDir, "events.jsonl"),
        `${JSON.stringify({ t: stamp, type: "run.failed", error: INTERRUPTED_RUN_ERROR, interrupted: true })}\n`,
        "utf8",
      );
      reconciled.push(runId);
    } catch {
      /* leave unreadable / read-only runs alone */
    }
  }
  return reconciled;
}

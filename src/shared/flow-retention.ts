import type { FlowRunRetentionPolicy, FlowRunStatus } from "./flow-types.js";

/** App-wide default: keep the newest 200 runs per flow, no age limit. */
export const DEFAULT_FLOW_RUN_RETENTION: FlowRunRetentionPolicy = {
  maxRuns: 200,
  maxAgeDays: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const LIVE_STATUSES: ReadonlySet<FlowRunStatus> = new Set<FlowRunStatus>([
  "pending",
  "running",
  "waiting_approval",
]);

export type FlowRunRecord = {
  runId: string;
  /** ISO start time from state.json; falls back to the run id timestamp. */
  startedAt: string | null;
  status: FlowRunStatus | null;
};

function normalizeLimit(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

/** Per-flow frontmatter overrides win field by field over the app-wide policy. */
export function resolveFlowRunRetention(
  global: FlowRunRetentionPolicy,
  flowOverrides: { maxRuns?: number | null; maxAgeDays?: number | null } = {},
): FlowRunRetentionPolicy {
  return {
    maxRuns: normalizeLimit(flowOverrides.maxRuns) ?? normalizeLimit(global.maxRuns),
    maxAgeDays: normalizeLimit(flowOverrides.maxAgeDays) ?? normalizeLimit(global.maxAgeDays),
  };
}

/** `20260630-090001-ab12-flow` → Date (local time), or null. */
export function runIdTimestamp(runId: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(runId);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function recordTime(run: FlowRunRecord): number {
  if (run.startedAt) {
    const t = Date.parse(run.startedAt);
    if (!Number.isNaN(t)) return t;
  }
  return runIdTimestamp(run.runId)?.getTime() ?? 0;
}

/**
 * Pick run ids to delete under a retention policy. Newest runs are kept first;
 * live runs (pending / running / waiting approval) and `keep` ids are never deleted
 * but still count toward `maxRuns`.
 */
export function selectRunsToPrune(
  runs: FlowRunRecord[],
  policy: FlowRunRetentionPolicy,
  now: Date = new Date(),
  keep: ReadonlySet<string> = new Set(),
): string[] {
  const maxRuns = normalizeLimit(policy.maxRuns);
  const maxAgeDays = normalizeLimit(policy.maxAgeDays);
  if (maxRuns === null && maxAgeDays === null) return [];

  const cutoff = maxAgeDays === null ? null : now.getTime() - maxAgeDays * DAY_MS;
  const ordered = [...runs].sort(
    (a, b) => recordTime(b) - recordTime(a) || b.runId.localeCompare(a.runId),
  );

  const doomed: string[] = [];
  ordered.forEach((run, index) => {
    if (keep.has(run.runId)) return;
    if (run.status && LIVE_STATUSES.has(run.status)) return;
    const overCount = maxRuns !== null && index >= maxRuns;
    const tooOld = cutoff !== null && recordTime(run) < cutoff;
    if (overCount || tooOld) doomed.push(run.runId);
  });
  return doomed;
}

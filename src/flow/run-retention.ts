import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  resolveFlowRunRetention,
  selectRunsToPrune,
  type FlowRunRecord,
} from "../shared/flow-retention.js";
import { readFlowSchedulePrefs } from "../shared/flow-schedule-pref.js";
import type { FlowRunRetentionPolicy } from "../shared/flow-types.js";
import { readRunState, runsDir } from "./run-state-store.js";

const RUN_ID_RE = /^\d{8}-\d{6}-/;

/**
 * Run folders that belong to `flowId`. `state.json` is authoritative; the folder-name
 * suffix is only a fallback because `-digest` is also a suffix of `-weekly-digest`.
 */
export function listRunRecordsForFlow(flowId: string): FlowRunRecord[] {
  const root = runsDir();
  if (!existsSync(root)) return [];
  const suffix = `-${flowId}`;
  const records: FlowRunRecord[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !RUN_ID_RE.test(entry.name) || !entry.name.endsWith(suffix)) {
      continue;
    }
    const state = readRunState(entry.name);
    if (state) {
      if (state.flowId !== flowId) continue;
      records.push({ runId: entry.name, startedAt: state.startedAt ?? null, status: state.status });
      continue;
    }
    let startedAt: string | null = null;
    try {
      startedAt = statSync(join(root, entry.name)).mtime.toISOString();
    } catch {
      /* fall back to the run id timestamp */
    }
    records.push({ runId: entry.name, startedAt, status: null });
  }
  return records;
}

export type PruneFlowRunHistoryOptions = {
  /** Per-flow overrides from frontmatter (`history_max_runs` / `history_max_days`). */
  flowOverrides?: { maxRuns?: number | null; maxAgeDays?: number | null };
  /** Override the app-wide policy (defaults to prefs). */
  policy?: FlowRunRetentionPolicy;
  /** Run ids never deleted (e.g. the run that just finished). */
  keepRunIds?: ReadonlySet<string>;
  now?: Date;
};

/** Delete old `runs/{runId}` folders for one flow. Returns deleted run ids. */
export function pruneFlowRunHistory(
  flowId: string,
  options: PruneFlowRunHistoryOptions = {},
): string[] {
  const prefs = readFlowSchedulePrefs();
  const global = options.policy ?? {
    maxRuns: prefs.historyMaxRuns,
    maxAgeDays: prefs.historyMaxDays,
  };
  const policy = resolveFlowRunRetention(global, options.flowOverrides);
  const doomed = selectRunsToPrune(
    listRunRecordsForFlow(flowId),
    policy,
    options.now ?? new Date(),
    options.keepRunIds,
  );
  const deleted: string[] = [];
  for (const runId of doomed) {
    try {
      rmSync(join(runsDir(), runId), { recursive: true, force: true });
      deleted.push(runId);
    } catch {
      /* locked (e.g. open in an editor) — retry on the next GC */
    }
  }
  return deleted;
}

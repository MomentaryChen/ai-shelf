import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import type { FlowRunState } from "../shared/flow-types.js";
import type { AttributionRunInput } from "./attribution.js";

function runsRoot(): string {
  return join(getAppDataDir(), "runs");
}

function readState(runId: string): FlowRunState | null {
  const statePath = join(runsRoot(), runId, "state.json");
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as FlowRunState;
  } catch {
    return null;
  }
}

/** Lightweight scan of recent flow runs for cost attribution (no flow/core import). */
export function scanRecentFlowRunsForAttribution(limit = 500): AttributionRunInput[] {
  const root = runsRoot();
  if (!existsSync(root)) return [];

  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse()
    .slice(0, limit);

  const runs: AttributionRunInput[] = [];
  for (const runId of dirs) {
    const state = readState(runId);
    if (!state?.flowId || !state.startedAt) continue;
    runs.push({
      runId: state.runId,
      flowId: state.flowId,
      status: state.status,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      completedAt: state.completedAt,
      profileId: state.profileId,
      agentTool: state.agentTool,
      costUsd: state.costUsd,
      costEstimated: state.costEstimated,
    });
  }
  return runs;
}

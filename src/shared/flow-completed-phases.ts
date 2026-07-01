import type { FlowRunState } from "./flow-types.js";

/** Phase ids marked done or skipped in a run state. */
export function completedPhaseIds(state: FlowRunState): string[] {
  return state.phases
    .filter((p) => p.status === "done" || p.status === "skipped")
    .map((p) => p.id);
}

export type FlowRunCompletedPhases = {
  runId: string;
  flowId: string;
  status: FlowRunState["status"];
  completed: string[];
};

export function summarizeCompletedPhases(state: FlowRunState): FlowRunCompletedPhases {
  return {
    runId: state.runId,
    flowId: state.flowId,
    status: state.status,
    completed: completedPhaseIds(state),
  };
}

import type { FlowPhaseStatus, FlowRunStatus } from "../../shared/flow-types.js";
import type { FlowPhaseProgressSlice } from "../utils/flow-run-progress";

function segmentClass(status: FlowPhaseStatus | undefined, runStatus?: FlowRunStatus | null): string {
  if (status === "done") return "bg-[var(--success)]";
  if (status === "skipped") return "bg-[var(--sand-deep)]";
  if (status === "failed") return "bg-red-400";
  if (status === "running") return "flow-phase-segment-active bg-[var(--clay)]";
  if (runStatus === "running" || runStatus === "pending") return "bg-transparent";
  return "bg-transparent";
}

type Props = {
  phases: FlowPhaseProgressSlice[];
  runStatus?: FlowRunStatus | null;
  /** All phases done but run still live — pulse the last segment. */
  finishing?: boolean;
  /** Run started; no phase active yet — pulse the first segment. */
  starting?: boolean;
};

export function FlowPhaseProgressBar({ phases, runStatus, finishing = false, starting = false }: Props) {
  const isLive = runStatus === "running" || runStatus === "pending";

  if (phases.length === 0) {
    if (!isLive) return null;
    return (
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--sand-deep)]">
        <div className="flow-phase-segment-active h-full w-1/3 rounded-full bg-[var(--clay)]" />
      </div>
    );
  }

  return (
    <div className="mb-6 flex h-1.5 gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={phases.length}>
      {phases.map((phase, index) => {
        const status = phase.status;
        let active = status === "running";
        if (starting && index === 0 && status === "pending") active = true;
        if (finishing && index === phases.length - 1 && status === "done") active = true;

        const filled =
          status === "done" ||
          status === "skipped" ||
          status === "failed" ||
          status === "running" ||
          active;

        return (
          <div
            key={phase.id}
            className="h-full min-w-[10px] flex-1 overflow-hidden rounded-full bg-[var(--sand-deep)]"
            title={phase.label}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${segmentClass(active ? "running" : status, runStatus)} ${
                filled ? "w-full" : "w-0"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

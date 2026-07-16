import type { FlowPhaseStatus, FlowRunStatus } from "../../shared/flow-types.js";
import type { MessageKey } from "../i18n/messages/en";

export type FlowPhaseProgressSlice = {
  id: string;
  label: string;
  status?: FlowPhaseStatus;
  message?: string | null;
};

export type FlowPhaseProgressSummary = {
  total: number;
  completed: number;
  running: FlowPhaseProgressSlice | null;
  failed: FlowPhaseProgressSlice | null;
  /** Run active but no phase has reported progress yet. */
  starting: boolean;
  /** All phases done; agent still running (e.g. writing output). */
  finishing: boolean;
};

export function summarizeFlowPhaseProgress(
  phases: FlowPhaseProgressSlice[],
  runStatus?: FlowRunStatus | null,
): FlowPhaseProgressSummary {
  const total = phases.length;
  const completed = phases.filter(
    (p) => p.status === "done" || p.status === "skipped",
  ).length;
  const waiting = phases.find((p) => p.status === "waiting_approval") ?? null;
  const running = phases.find((p) => p.status === "running") ?? waiting;
  const failed = phases.find((p) => p.status === "failed") ?? null;
  const isLive =
    runStatus === "running" || runStatus === "pending" || runStatus === "waiting_approval";

  return {
    total,
    completed,
    running,
    failed,
    starting: isLive && total > 0 && completed === 0 && !running,
    finishing: isLive && total > 0 && completed === total && !failed,
  };
}

export function formatPhaseSteps(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  completed: number,
  total: number,
): string {
  if (total === 0) return t("flow.progress.noPhases");
  return t("flow.progress.steps", { completed, total });
}

export function formatFlowProgressStatus(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  runStatus: FlowRunStatus | null | undefined,
  summary: FlowPhaseProgressSummary,
): string {
  const steps = formatPhaseSteps(t, summary.completed, summary.total);

  if (runStatus === "completed") {
    return summary.total > 0 ? `${t("flow.status.completed")} · ${steps}` : t("flow.status.completed");
  }
  if (runStatus === "failed" || runStatus === "cancelled") {
    const status = t(`flow.status.${runStatus}` as MessageKey);
    return summary.total > 0 ? `${status} · ${steps}` : status;
  }
  if (runStatus === "waiting_approval") {
    const label = summary.running?.label;
    return label
      ? `${t("flow.status.waitingApproval")} · ${label}`
      : t("flow.status.waitingApproval");
  }
  if (runStatus !== "running" && runStatus !== "pending") {
    return steps;
  }

  if (summary.finishing) {
    return `${t("flow.status.running")} · ${t("flow.progress.finishing")}`;
  }
  if (summary.starting) {
    return `${t("flow.status.running")} · ${t("flow.progress.starting")}`;
  }
  if (summary.running) {
    return `${t("flow.status.running")} · ${steps} · ${summary.running.label}`;
  }
  return summary.total > 0
    ? `${t("flow.status.running")} · ${steps}`
    : t("flow.status.running");
}

export function flowProgressActiveMessage(summary: FlowPhaseProgressSummary): string | null {
  if (summary.running?.message?.trim()) return summary.running.message.trim();
  if (summary.finishing) return null;
  if (summary.starting) return null;
  return null;
}

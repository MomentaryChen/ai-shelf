import { ChevronRight, Clock } from "lucide-react";
import type { FlowPhaseStatus, FlowRunStatus } from "../../shared/flow-types.js";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { profileToolLabel } from "../utils/available-tools";
import {
  flowProgressActiveMessage,
  formatFlowProgressStatus,
  summarizeFlowPhaseProgress,
} from "../utils/flow-run-progress";
import { FlowPhaseProgressBar } from "./FlowPhaseProgressBar";

export interface FlowDagPhase {
  id: string;
  label: string;
  status?: FlowPhaseStatus;
  message?: string | null;
}

function phaseStatusLabel(status: FlowPhaseStatus, t: (key: MessageKey) => string): string {
  switch (status) {
    case "pending":
      return t("flow.phase.pending");
    case "running":
      return t("flow.phase.running");
    case "done":
      return t("flow.phase.done");
    case "failed":
      return t("flow.phase.failed");
    case "skipped":
      return t("flow.phase.skipped");
    default:
      return status;
  }
}

function nodeStyles(status: FlowPhaseStatus = "pending"): string {
  switch (status) {
    case "running":
      return "border-accent bg-bg-secondary ring-2 ring-accent/35";
    case "done":
      return "border-ok/50 bg-bg-secondary";
    case "failed":
      return "border-fail/70 bg-fail/10";
    case "skipped":
      return "border-border-subtle bg-bg-elevated/40 opacity-80";
    default:
      return "border-border bg-bg-secondary";
  }
}

function DagNode({
  title,
  subtitle,
  status = "pending",
  mono = false,
}: {
  title: string;
  subtitle?: string;
  status?: FlowPhaseStatus;
  mono?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div
      className={`min-w-[140px] max-w-[200px] rounded-[20px] border px-4 py-3 transition-all duration-300 ${nodeStyles(status)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-secondary">{phaseStatusLabel(status, t)}</span>
        {status === "running" && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
        )}
        {status === "done" && (
          <span className="h-2 w-2 rounded-full bg-ok" aria-hidden />
        )}
      </div>
      <div
        className={`mt-1 text-[13px] font-medium leading-snug text-text-primary ${mono ? "font-mono text-[12px] break-all" : ""}`}
      >
        {title}
      </div>
      {subtitle && (
        <div className="mt-1 text-[11px] leading-snug text-text-secondary break-all">{subtitle}</div>
      )}
    </div>
  );
}

function formatNextRun(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function FlowDagView({
  phases,
  runner,
  httpUrl,
  agentTool,
  toolArgs,
  cwd,
  profileId,
  schedule,
  nextRunAt,
  runStatus,
  error,
  outputPath,
  onOpenOutput,
}: {
  phases: FlowDagPhase[];
  runner?: "claude" | "http";
  httpUrl?: string;
  agentTool?: string;
  toolArgs?: string;
  cwd?: string;
  profileId?: string;
  schedule?: string;
  nextRunAt?: string | null;
  runStatus?: FlowRunStatus | null;
  error?: string | null;
  outputPath?: string | null;
  onOpenOutput?: () => void;
}) {
  const { t } = useLocale();
  const progress = summarizeFlowPhaseProgress(phases, runStatus);
  const progressStatus = formatFlowProgressStatus(t, runStatus, progress);
  const progressMessage = flowProgressActiveMessage(progress);

  const triggerLabel =
    runner === "http"
      ? t("flow.dag.triggerHttp")
      : t("flow.dag.triggerAgent", { tool: profileToolLabel(agentTool || "claude") });

  const agentSubtitleParts: string[] = [];
  if (toolArgs?.trim()) agentSubtitleParts.push(toolArgs.trim());
  if (cwd?.trim()) agentSubtitleParts.push(cwd.trim());
  if (profileId?.trim()) agentSubtitleParts.push(`@${profileId.trim()}`);

  const triggerSubtitle =
    runner === "http" && httpUrl
      ? httpUrl.replace(/^https?:\/\//, "")
      : agentSubtitleParts.length > 0
        ? agentSubtitleParts.join(" · ")
        : undefined;

  const nextRunLabel = schedule ? formatNextRun(nextRunAt) : null;

  return (
    <div className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-1">
          <h2 className="text-[13px] font-medium text-text-primary">{t("flow.dag.title")}</h2>
          {schedule && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
              <Clock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              <span className="font-mono text-[11px]">{schedule}</span>
              {nextRunLabel && (
                <>
                  <span aria-hidden>·</span>
                  <span>{t("flow.nextRun", { time: nextRunLabel })}</span>
                </>
              )}
            </div>
          )}
        </div>
        {runStatus && runStatus !== "pending" && (
          <span
            className={`text-[12px] font-medium ${
              runStatus === "completed"
                ? "text-ok"
                : runStatus === "failed" || runStatus === "cancelled"
                  ? "text-fail"
                  : "text-accent"
            }`}
          >
            {progressStatus}
          </span>
        )}
      </div>

      {(runStatus === "running" || runStatus === "pending") && (
        <FlowPhaseProgressBar
          phases={phases}
          runStatus={runStatus}
          starting={progress.starting}
          finishing={progress.finishing}
        />
      )}

      {progressMessage && runStatus === "running" && (
        <p className="-mt-4 mb-4 text-[12px] leading-relaxed text-text-secondary">{progressMessage}</p>
      )}

      <div className="flex flex-col items-center gap-4 overflow-x-auto py-2">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <DagNode
            title={triggerLabel}
            subtitle={triggerSubtitle}
            status={runStatus === "running" ? "running" : runStatus === "completed" || runStatus === "failed" ? "done" : "pending"}
            mono={!!triggerSubtitle}
          />
          <ChevronRight className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden />

          {phases.length === 0 ? (
            <DagNode title={t("flow.dag.empty")} status="pending" />
          ) : (
            phases.map((phase, index) => (
              <div key={phase.id} className="flex items-center gap-3">
                <DagNode
                  title={phase.label}
                  subtitle={phase.message ?? phase.id}
                  status={phase.status ?? "pending"}
                />
                {index < phases.length - 1 && (
                  <ChevronRight className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden />
                )}
              </div>
            ))
          )}

          <ChevronRight className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden />
          <DagNode
            title={t("flow.dag.output")}
            status={
              runStatus === "completed" ? "done" : runStatus === "failed" ? "failed" : "pending"
            }
          />
        </div>
      </div>

      {error && <p className="mt-4 text-[13px] text-fail">{error}</p>}

      {outputPath && runStatus === "completed" && onOpenOutput && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onOpenOutput}
            className="cursor-pointer rounded-[22px] border border-border bg-bg-primary px-4 py-2 text-[13px] text-text-primary transition-colors hover:border-accent"
          >
            {t("flow.viewOutput")}
          </button>
        </div>
      )}
    </div>
  );
}

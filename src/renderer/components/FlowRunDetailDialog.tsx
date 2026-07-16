import { useEffect, useState } from "react";
import { FileText, FolderOpen, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FlowRunEvent, FlowRunState } from "../types";
import { FlowMarkdownContent } from "./FlowMarkdownContent";
import { useLocale } from "../i18n/LocaleProvider";
import { formatRunDuration, formatRunTimestamp, runStatusTone } from "../utils/flow-run-utils";
import { formatPhaseSteps } from "../utils/flow-run-progress";

type Props = {
  run: FlowRunState;
  onClose: () => void;
  onOpenOutput?: (path: string) => void;
};

function statusLabel(
  status: FlowRunState["status"],
  t: (key: import("../i18n/messages/en.js").MessageKey) => string,
): string {
  switch (status) {
    case "waiting_approval":
      return t("flow.status.waitingApproval");
    case "pending":
      return t("flow.status.pending");
    case "running":
      return t("flow.status.running");
    case "completed":
      return t("flow.status.completed");
    case "failed":
      return t("flow.status.failed");
    case "cancelled":
      return t("flow.status.cancelled");
    default:
      return status;
  }
}

function eventSummary(
  event: FlowRunEvent,
  t: (key: import("../i18n/messages/en.js").MessageKey, params?: Record<string, string>) => string,
): string {
  if (event.type === "run.started") {
    return t("flow.history.event.runStarted", { trigger: event.trigger ?? "manual" });
  }
  if (event.type === "run.completed") return t("flow.history.event.runCompleted");
  if (event.type === "run.cancelled") return t("flow.history.event.runCancelled");
  if (event.type === "run.failed") {
    return event.error ? t("flow.history.event.runFailed", { error: event.error }) : t("flow.history.event.runFailedShort");
  }
  if (event.type.startsWith("phase.")) {
    const phase = event.phaseId ?? "?";
    if (event.message) return `${phase}: ${event.message}`;
    return t("flow.history.event.phase", { type: event.type, phase });
  }
  if (event.type === "flow.output") return t("flow.history.event.flowOutput");
  return event.type;
}

export function FlowRunDetailDialog({ run, onClose, onOpenOutput }: Props) {
  const { t } = useLocale();
  const [events, setEvents] = useState<FlowRunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [outputContent, setOutputContent] = useState<string | null>(null);
  const [outputLoading, setOutputLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.api.flowGetRunEvents(run.runId).then((rows) => {
      if (!cancelled) {
        setEvents(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [run.runId]);

  useEffect(() => {
    let cancelled = false;
    setOutputLoading(true);
    setOutputContent(null);
    void window.api.flowReadRunOutput(run.runId).then((res) => {
      if (cancelled) return;
      if (res.ok && res.content?.trim()) {
        setOutputContent(res.content);
      }
    }).finally(() => {
      if (!cancelled) setOutputLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [run.runId, run.outputPath, run.updatedAt]);

  const tone = runStatusTone(run.status);
  const duration = formatRunDuration(run.startedAt, run.updatedAt, run.status);

  const openArtifact = (artifact: "prompt" | "events" | "output" | "runDir") => {
    void window.api.flowOpenRunArtifact(run.runId, artifact);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[88vh] max-w-2xl flex-col border-border bg-bg-secondary text-text-primary"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{t("flow.history.detailTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 rounded-[20px] border border-border bg-bg-primary px-4 py-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                tone === "success"
                  ? "bg-ok/15 text-ok"
                  : tone === "failed"
                    ? "bg-fail/15 text-fail"
                    : tone === "running"
                      ? "bg-bg-card text-accent"
                      : "bg-bg-elevated text-text-secondary"
              }`}
            >
              {statusLabel(run.status, t)}
            </span>
            <span className="text-text-secondary">{duration}</span>
            {run.progress.total > 0 && (
              <span className="text-text-secondary">
                {formatPhaseSteps(t, run.progress.completed, run.progress.total)}
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-text-secondary">{run.runId}</p>
          <p className="text-[12px] text-text-secondary">
            {formatRunTimestamp(run.startedAt)}
            {run.error && (
              <span className="mt-1 block text-fail">{run.error}</span>
            )}
          </p>
        </div>

        {(outputLoading || outputContent) && (
          <div className="rounded-[20px] border border-border bg-bg-primary p-4">
            <h3 className="mb-3 text-[12px] font-medium text-text-primary">{t("flow.output.panelTitle")}</h3>
            {outputLoading ? (
              <p className="py-4 text-center text-[13px] text-text-secondary">{t("flow.output.loading")}</p>
            ) : outputContent ? (
              <div className="max-h-[240px] overflow-y-auto">
                <FlowMarkdownContent content={outputContent} />
              </div>
            ) : null}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-[20px] border border-border bg-bg-secondary p-4">
          <h3 className="mb-3 text-[12px] font-medium uppercase tracking-wide text-text-secondary">
            {t("flow.history.timeline")}
          </h3>
          {loading ? (
            <p className="py-6 text-center text-[13px] text-text-secondary">{t("flow.history.loadingEvents")}</p>
          ) : events.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-secondary">{t("flow.history.noEvents")}</p>
          ) : (
            <ol className="space-y-3">
              {events.map((event, idx) => (
                <li key={`${event.t}-${idx}`} className="flex gap-3 text-[13px]">
                  <span className="w-[4.5rem] shrink-0 font-mono text-[10px] leading-relaxed text-text-secondary">
                    {formatRunTimestamp(event.t).split(", ").pop()}
                  </span>
                  <span className="min-w-0 flex-1 leading-relaxed text-text-primary">
                    {eventSummary(event, t)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-[22px]"
            onClick={() => openArtifact("prompt")}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("flow.history.openPrompt")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-[22px]"
            onClick={() => openArtifact("events")}
          >
            <ScrollText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("flow.history.openEvents")}
          </Button>
          {run.outputPath && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-[22px]"
              onClick={() => {
                if (onOpenOutput && run.outputPath) onOpenOutput(run.outputPath);
                else openArtifact("output");
              }}
            >
              {t("flow.output.expand")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-[22px]"
            onClick={() => openArtifact("runDir")}
          >
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("flow.history.openRunDir")}
          </Button>
          <Button type="button" size="sm" className="ml-auto rounded-[22px]" onClick={onClose}>
            {t("flow.source.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

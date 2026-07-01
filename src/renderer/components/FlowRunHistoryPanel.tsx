import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { FlowRunState } from "../types";
import { useLocale } from "../i18n/LocaleProvider";
import { formatRunDuration, formatRunTimestamp, runStatusTone } from "../utils/flow-run-utils";
import { formatPhaseSteps } from "../utils/flow-run-progress";

type Props = {
  flowId: string;
  refreshKey?: number;
  onSelectRun: (run: FlowRunState) => void;
};

export function FlowRunHistoryPanel({ flowId, refreshKey = 0, onSelectRun }: Props) {
  const { t } = useLocale();
  const [runs, setRuns] = useState<FlowRunState[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await window.api.flowListRunsForFlow(flowId, 30);
      setRuns(items);
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading && runs.length === 0) {
    return (
      <section className="rounded-[28px] border border-[var(--sand)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-[13px] font-medium text-[var(--ink)]">{t("flow.history.title")}</h2>
        <p className="mt-3 text-[13px] text-[var(--muted)]">{t("flow.history.loading")}</p>
      </section>
    );
  }

  if (runs.length === 0) {
    return (
      <section className="rounded-[28px] border border-[var(--sand)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-[13px] font-medium text-[var(--ink)]">{t("flow.history.title")}</h2>
        <p className="mt-3 text-[13px] text-[var(--muted)]">{t("flow.history.empty")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-[var(--sand)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-3 text-[13px] font-medium text-[var(--ink)]">{t("flow.history.title")}</h2>
      <ul className="divide-y divide-[var(--sand)]">
        {runs.map((run) => {
          const tone = runStatusTone(run.status);
          const duration = formatRunDuration(run.startedAt, run.updatedAt, run.status);
          return (
            <li key={run.runId}>
              <button
                type="button"
                onClick={() => onSelectRun(run)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[16px] px-2 py-2.5 text-left transition-colors hover:bg-[var(--sand-deep)]/50"
              >
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    tone === "success"
                      ? "bg-[#7FB069]/20 text-[#3d6b32]"
                      : tone === "failed"
                        ? "bg-red-100 text-red-800"
                        : tone === "running"
                          ? "bg-[var(--sand)] text-[var(--clay-deep)]"
                          : "bg-[var(--sand-deep)] text-[var(--muted)]"
                  }`}
                >
                  {t(`flow.status.${run.status}` as "flow.status.completed")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink)]">
                  {formatRunTimestamp(run.startedAt)}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-[var(--muted)]">{duration}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                  {run.progress.total > 0
                    ? formatPhaseSteps(t, run.progress.completed, run.progress.total)
                    : "—"}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

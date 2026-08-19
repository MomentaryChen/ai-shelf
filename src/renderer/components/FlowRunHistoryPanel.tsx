import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FlowRunState } from "../types";
import { useLocale } from "../i18n/LocaleProvider";
import { formatRunDuration, formatRunTimestamp, runStatusTone } from "../utils/flow-run-utils";
import { formatPhaseSteps } from "../utils/flow-run-progress";

const PAGE_SIZE = 10;

type PageResult = {
  items: FlowRunState[];
  total: number;
  offset: number;
};

type Props = {
  flowId: string;
  refreshKey?: number;
  onSelectRun: (run: FlowRunState) => void;
};

export function FlowRunHistoryPanel({ flowId, refreshKey = 0, onSelectRun }: Props) {
  const { t } = useLocale();
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedFlowId, setLoadedFlowId] = useState(flowId);

  if (flowId !== loadedFlowId) {
    setLoadedFlowId(flowId);
    setPage(0);
    setResult(null);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    const offset = page * PAGE_SIZE;
    setLoading(true);
    void window.api
      .flowListRunsForFlow(flowId, PAGE_SIZE, offset)
      .then((data) => {
        if (cancelled) return;
        const total = typeof data.total === "number" ? data.total : 0;
        const items = Array.isArray(data.items) ? data.items : [];
        const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
        if (page > maxPage) {
          setPage(maxPage);
          return;
        }
        setResult({ items, total, offset });
      })
      .catch(() => {
        /* keep the last successful page */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flowId, page, refreshKey]);

  const runs = result?.items ?? [];
  const total = result?.total ?? 0;
  const from = total === 0 ? 0 : (result?.offset ?? 0) + 1;
  const to = (result?.offset ?? 0) + runs.length;
  const hasPrev = (result?.offset ?? 0) > 0;
  const hasNext = result != null && result.offset + runs.length < result.total;
  const showPager = total > PAGE_SIZE;

  if (loading && runs.length === 0) {
    return (
      <section className="rounded-[28px] border border-border bg-bg-secondary p-4 shadow-card">
        <h2 className="text-[13px] font-medium text-text-primary">{t("flow.history.title")}</h2>
        <p className="mt-3 text-[13px] text-text-secondary">{t("flow.history.loading")}</p>
      </section>
    );
  }

  if (total === 0) {
    return (
      <section className="rounded-[28px] border border-border bg-bg-secondary p-4 shadow-card">
        <h2 className="text-[13px] font-medium text-text-primary">{t("flow.history.title")}</h2>
        <p className="mt-3 text-[13px] text-text-secondary">{t("flow.history.empty")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-border bg-bg-secondary p-4 shadow-card">
      <h2 className="mb-3 text-[13px] font-medium text-text-primary">{t("flow.history.title")}</h2>
      <ul className="divide-y divide-border">
        {runs.map((run) => {
          const tone = runStatusTone(run.status);
          const duration = formatRunDuration(run.startedAt, run.updatedAt, run.status);
          return (
            <li key={run.runId}>
              <button
                type="button"
                onClick={() => onSelectRun(run)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[16px] px-2 py-2.5 text-left transition-colors hover:bg-bg-elevated/50"
              >
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    tone === "success"
                      ? "bg-ok/15 text-ok"
                      : tone === "failed"
                        ? "bg-fail/15 text-fail"
                        : tone === "running"
                          ? "bg-bg-card text-accent"
                          : "bg-bg-elevated text-text-secondary"
                  }`}
                >
                  {t(`flow.status.${run.status}` as "flow.status.completed")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                  {formatRunTimestamp(run.startedAt)}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-text-secondary">{duration}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-text-secondary">
                  {run.progress.total > 0
                    ? formatPhaseSteps(t, run.progress.completed, run.progress.total)
                    : "—"}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {showPager && (
        <nav className="mt-3 flex items-center justify-between gap-2" aria-label={t("flow.history.title")}>
          <p className="min-w-0 text-[13px] tabular-nums text-text-secondary" aria-live="polite">
            {t("flow.history.pageRange", { from, to, total })}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || !hasPrev}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {t("flow.history.prevPage")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || !hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("flow.history.nextPage")}
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}

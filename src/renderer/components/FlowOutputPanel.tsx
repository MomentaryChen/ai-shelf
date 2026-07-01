import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowMarkdownContent } from "./FlowMarkdownContent";
import { useLocale } from "../i18n/LocaleProvider";
import { formatOutputDate } from "../utils/flow-run-utils";

type Props = {
  runId: string;
  /** ISO timestamp of the run that produced this output. */
  runStartedAt?: string | null;
  /** Bumps when run state / output file changes (e.g. state.updatedAt). */
  refreshKey?: string;
  /** Show waiting hint while agent has not called flow_output yet. */
  waiting?: boolean;
  /** New run in progress; still showing previous output until updated. */
  inProgress?: boolean;
  onExpand?: (filePath: string) => void;
};

export function FlowOutputPanel({
  runId,
  runStartedAt,
  refreshKey,
  waiting = false,
  inProgress = false,
  onExpand,
}: Props) {
  const { t } = useLocale();
  const [content, setContent] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [loadedStartedAt, setLoadedStartedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setContent(null);
      setOutputPath(null);
      setLoadedStartedAt(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void window.api
      .flowReadRunOutput(runId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setContent(null);
          setOutputPath(null);
          setLoadedStartedAt(null);
          if (!waiting) setError(res.error ?? t("flow.output.loadFailed"));
          return;
        }
        setContent(res.content ?? "");
        setOutputPath(res.outputPath ?? null);
        setLoadedStartedAt(res.startedAt ?? runStartedAt ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runId, refreshKey, waiting, runStartedAt, t]);

  const hasContent = Boolean(content?.trim());
  const displayDate = runStartedAt ?? loadedStartedAt;

  return (
    <section className="rounded-[28px] border border-border bg-bg-secondary p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium text-text-primary">{t("flow.output.panelTitle")}</h2>
          {displayDate && hasContent && (
            <p className="mt-1 text-[12px] text-text-secondary">
              {t("flow.output.generatedAt", { date: formatOutputDate(displayDate) })}
            </p>
          )}
        </div>
        {outputPath && hasContent && (
          <div className="flex shrink-0 items-center gap-2">
            {onExpand && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-[22px] text-[12px]"
                onClick={() => onExpand(outputPath)}
              >
                {t("flow.output.expand")}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-[22px] text-[12px] text-text-primary"
              onClick={() => void window.api.openPath(outputPath)}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden />
              {t("flow.output.openExternal")}
            </Button>
          </div>
        )}
      </div>

      {inProgress && (
        <p className="mb-3 rounded-[16px] border border-border bg-bg-primary px-3 py-2 text-[12px] text-text-secondary">
          {t("flow.output.inProgress")}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-[13px] text-text-secondary">{t("flow.output.loading")}</p>
      ) : waiting && !hasContent ? (
        <div className="rounded-[20px] border border-dashed border-border bg-bg-primary px-4 py-8 text-center">
          <p className="text-[13px] text-text-secondary">{t("flow.output.waiting")}</p>
        </div>
      ) : error && !hasContent ? (
        <p className="py-6 text-center text-[13px] text-fail">{error}</p>
      ) : hasContent ? (
        <div className="max-h-[min(520px,55vh)] overflow-y-auto rounded-[20px] border border-border bg-bg-primary px-5 py-4">
          <FlowMarkdownContent content={content!} />
        </div>
      ) : (
        <p className="py-6 text-center text-[13px] text-text-secondary">{t("flow.output.noOutput")}</p>
      )}
    </section>
  );
}

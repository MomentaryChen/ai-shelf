import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FlowDagNodeCommandDetail } from "../../flow/flow-command-preview.js";
import { useLocale } from "../i18n/LocaleProvider";
import { writeClipboardText } from "../terminal/xterm-clipboard";

type Props = {
  flowId: string;
  node: {
    kind: "trigger" | "phase" | "output";
    phaseId?: string;
    phaseLabel?: string;
    phaseMessage?: string | null;
  };
  runId?: string | null;
  outputPath?: string | null;
  globalToolLaunchArgs?: Record<string, string>;
  onClose: () => void;
};

export function FlowDagNodeDetailDialog({
  flowId,
  node,
  runId,
  outputPath,
  globalToolLaunchArgs,
  onClose,
}: Props) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<FlowDagNodeCommandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void window.api
      .flowGetDagNodeCommand(flowId, node, {
        runId: runId ?? undefined,
        outputPath: outputPath ?? undefined,
        globalToolLaunchArgs,
      })
      .then((res) => {
        if (cancelled) return;
        if ("error" in res) {
          setError(res.error ?? t("flow.dag.inspectLoadFailed"));
          setDetail(null);
          return;
        }
        setDetail(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flowId, node, runId, outputPath, globalToolLaunchArgs, t]);

  const title =
    node.kind === "trigger"
      ? t("flow.dag.inspectTriggerTitle")
      : node.kind === "output"
        ? t("flow.dag.inspectOutputTitle")
        : t("flow.dag.inspectPhaseTitle", { label: node.phaseLabel ?? node.phaseId ?? "" });

  const copyCommand = async () => {
    if (!detail?.commandLine) return;
    await writeClipboardText(detail.commandLine);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl border-border bg-bg-secondary text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-[13px] text-text-secondary">{t("flow.dag.inspectLoading")}</p>
        ) : error ? (
          <p className="rounded-[20px] border border-fail/30 bg-fail/10 px-4 py-3 text-[13px] text-fail">
            {error}
          </p>
        ) : detail ? (
          <div className="space-y-4 text-[13px]">
            {detail.kind === "trigger" && detail.commandLine && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-text-secondary">
                    {t("flow.dag.inspectCommand")}
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    {detail.source === "logged"
                      ? t("flow.dag.inspectLogged")
                      : detail.source === "preview"
                        ? t("flow.dag.inspectPreview")
                        : null}
                  </span>
                </div>
                <pre className="overflow-x-auto rounded-[20px] border border-border bg-bg-primary px-4 py-3 font-mono text-[12px] leading-relaxed text-text-primary whitespace-pre-wrap break-all">
                  {detail.commandLine}
                </pre>
              </div>
            )}

            {detail.kind === "trigger" && detail.httpUrl && (
              <div className="space-y-1">
                <span className="text-[12px] font-medium text-text-secondary">
                  {t("flow.dag.inspectHttp")}
                </span>
                <p className="font-mono text-[12px] text-text-primary break-all">
                  {detail.httpMethod} {detail.httpUrl}
                </p>
              </div>
            )}

            {detail.cwd && (
              <div className="space-y-1">
                <span className="text-[12px] font-medium text-text-secondary">
                  {t("flow.dag.inspectCwd")}
                </span>
                <p className="font-mono text-[12px] text-text-primary break-all">{detail.cwd}</p>
              </div>
            )}

            {detail.stdinNote && (
              <p className="text-[12px] leading-relaxed text-text-secondary">
                {t("flow.dag.inspectStdin")}
              </p>
            )}

            {detail.kind === "phase" && (
              <div className="space-y-2 rounded-[20px] border border-border bg-bg-primary px-4 py-3">
                {detail.phaseId && (
                  <p className="font-mono text-[11px] text-text-secondary">{detail.phaseId}</p>
                )}
                {detail.phaseMessage && (
                  <p className="text-[13px] leading-relaxed text-text-primary">{detail.phaseMessage}</p>
                )}
                <p className="text-[12px] leading-relaxed text-text-secondary">
                  {t("flow.dag.inspectPhaseHint")}
                </p>
              </div>
            )}

            {detail.kind === "output" && (
              <div className="space-y-2">
                {detail.outputPath ? (
                  <>
                    <span className="text-[12px] font-medium text-text-secondary">
                      {t("flow.dag.inspectOutputPath")}
                    </span>
                    <p className="font-mono text-[12px] text-text-primary break-all">{detail.outputPath}</p>
                  </>
                ) : (
                  <p className="text-[13px] text-text-secondary">{t("flow.dag.inspectNoOutput")}</p>
                )}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {detail?.commandLine && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-[22px]"
              onClick={() => void copyCommand()}
            >
              {t("flow.dag.inspectCopy")}
            </Button>
          )}
          <Button type="button" size="sm" className="ml-auto rounded-[22px]" onClick={onClose}>
            {t("flow.source.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

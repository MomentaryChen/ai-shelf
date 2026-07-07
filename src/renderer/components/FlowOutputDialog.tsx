import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlowMarkdownContent } from "./FlowMarkdownContent";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  filePath: string;
  runId?: string;
  onClose: () => void;
};

export function FlowOutputDialog({ filePath, runId, onClose }: Props) {
  const { t } = useLocale();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = runId
      ? window.api.flowReadRunOutput(runId).then((res) => {
          if (!res.ok) return { success: false as const, error: res.error, content: "" };
          return { success: true as const, content: res.content ?? "" };
        })
      : window.api.readConfigFile(filePath).then((res) => ({
          success: res.success,
          error: res.error,
          content: res.content,
        }));

    void load
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setError(res.error ?? t("flow.output.loadFailed"));
          return;
        }
        setContent(res.content);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, runId, t]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] max-w-3xl flex-col border-border bg-bg-secondary text-text-primary"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{t("flow.output.title")}</DialogTitle>
        </DialogHeader>
        <p className="break-all font-mono text-[11px] text-text-secondary">{filePath}</p>

        {loading ? (
          <div className="py-16 text-center text-[13px] text-text-secondary">{t("flow.output.loading")}</div>
        ) : error ? (
          <div className="py-12 text-center text-[13px] text-fail">{error}</div>
        ) : (
          <div className="min-h-[280px] flex-1 overflow-auto rounded-[20px] border border-border bg-bg-primary px-5 py-4">
            {content.trim() ? (
              <FlowMarkdownContent content={content} />
            ) : (
              <p className="text-[13px] text-text-secondary">{t("flow.output.empty")}</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-[22px]"
            onClick={() => void window.api.openPath(filePath)}
          >
            {t("flow.output.openExternal")}
          </Button>
          <Button type="button" size="sm" className="rounded-[22px]" onClick={onClose}>
            {t("flow.source.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

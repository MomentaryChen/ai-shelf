import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  filePath: string;
  onClose: () => void;
};

export function FlowOutputDialog({ filePath, onClose }: Props) {
  const { t } = useLocale();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void window.api
      .readConfigFile(filePath)
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
  }, [filePath, t]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] max-w-3xl flex-col border-[var(--sand)] bg-[var(--surface)] text-[var(--ink)]"
        data-surface="warm"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">{t("flow.output.title")}</DialogTitle>
        </DialogHeader>
        <p className="break-all font-mono text-[11px] text-[var(--muted)]">{filePath}</p>

        {loading ? (
          <div className="py-16 text-center text-[13px] text-[var(--muted)]">{t("flow.output.loading")}</div>
        ) : error ? (
          <div className="py-12 text-center text-[13px] text-red-700">{error}</div>
        ) : (
          <pre className="min-h-[280px] flex-1 overflow-auto rounded-[20px] border border-[var(--sand)] bg-[var(--cream)] p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
            {content || t("flow.output.empty")}
          </pre>
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

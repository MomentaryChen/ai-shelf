import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "../i18n/LocaleProvider";

interface Props {
  flowId: string;
  onClose: () => void;
  onSaved?: () => void;
}

/** View and edit a `.flow.md` source file. */
export function FlowSourceDialog({ flowId, onClose, onSaved }: Props) {
  const { t } = useLocale();
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    window.api
      .flowReadFile(flowId)
      .then((file) => {
        if (cancelled) return;
        if (!file) {
          setLoadError(t("flow.source.notFound"));
          return;
        }
        setPath(file.path);
        setContent(file.content);
        setOriginal(file.content);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flowId, t]);

  const dirty = content !== original;

  const save = async () => {
    if (!path) return;
    setSaving(true);
    setSaveError(null);
    const res = await window.api.writeConfigFile(path, content);
    setSaving(false);
    if (res.success) {
      setOriginal(content);
      onSaved?.();
      onClose();
    } else {
      setSaveError(res.error ?? t("flow.source.saveFailed"));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] max-w-3xl flex-col border-border bg-bg-secondary text-text-primary"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-text-primary">
            {t("flow.source.title")}
          </DialogTitle>
        </DialogHeader>
        {path && (
          <p className="break-all font-mono text-[11px] text-text-secondary">{path}</p>
        )}

        {loading ? (
          <div className="py-12 text-center text-[13px] text-text-secondary">{t("flow.source.loading")}</div>
        ) : loadError ? (
          <div className="py-12 text-center text-[13px] text-fail">{loadError}</div>
        ) : (
          <>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="min-h-[360px] flex-1 resize-none rounded-[20px] border-border bg-bg-primary font-mono text-[12px] leading-relaxed text-text-primary"
            />
            {saveError && <p className="break-all text-[12px] text-fail">{saveError}</p>}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-[22px]"
                onClick={() => void window.api.flowOpenFile(flowId)}
              >
                {t("flow.openInEditor")}
              </Button>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" className="rounded-[22px]" onClick={onClose}>
                  {t("flow.source.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-[22px]"
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                >
                  {saving ? t("flow.source.saving") : t("flow.source.save")}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { AlertTriangle, XCircle } from "lucide-react";
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
  path: string;
  onClose: () => void;
  onSaved?: () => void;
}

/** In-app editor for a raw config file with JSON validation and .bak backup. */
export function ConfigFileEditorModal({ path, onClose, onSaved }: Props) {
  const { t } = useLocale();
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isJson = path.endsWith(".json");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    window.api
      .readConfigFile(path)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setContent(res.content);
          setOriginal(res.content);
        } else {
          setLoadError(res.error ?? "Failed to read file");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const jsonError = (() => {
    if (!isJson || !content.trim()) return null;
    try {
      JSON.parse(content);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  })();

  const dirty = content !== original;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const res = await window.api.writeConfigFile(path, content);
    setSaving(false);
    if (res.success) {
      setOriginal(content);
      onSaved?.();
      onClose();
    } else {
      setSaveError(res.error ?? "Save failed");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col border-border bg-bg-card text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-sm text-text-primary">{t("configEditor.title")}</DialogTitle>
        </DialogHeader>
        <p className="break-all font-mono text-xs text-text-secondary">{path}</p>

        {loading ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            {t("configEditor.loading")}
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center gap-1.5 py-12 text-sm text-fail">
            <XCircle aria-hidden className="h-4 w-4 shrink-0" /> {loadError}
          </div>
        ) : (
          <>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="min-h-[340px] flex-1 resize-none border-border bg-bg-primary font-mono text-xs leading-relaxed text-text-primary"
            />
            {jsonError && (
              <p className="mt-2 break-all text-xs text-fail">
                <AlertTriangle aria-hidden className="inline h-3.5 w-3.5 align-[-2px]" />{" "}
                {t("configEditor.invalidJson")}: {jsonError}
              </p>
            )}
            {saveError && (
              <p className="mt-2 inline-flex items-start gap-1 break-all text-xs text-fail">
                <XCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {saveError}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-text-tertiary">{t("configEditor.backupNote")}</span>
              <DialogFooter className="gap-2 sm:justify-end">
                <Button size="sm" variant="ghost" onClick={onClose}>
                  {t("configEditor.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving || !dirty || !!jsonError}
                  title={!dirty ? t("configEditor.noChanges") : undefined}
                >
                  {saving ? t("configEditor.saving") : t("configEditor.save")}
                </Button>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

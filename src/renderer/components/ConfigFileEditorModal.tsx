import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { Button } from "./Button";

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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-bg-card p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text-primary">{t("configEditor.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
            aria-label={t("configEditor.cancel")}
          >
            ✕
          </button>
        </div>
        <p className="mb-3 break-all font-mono text-xs text-text-secondary">{path}</p>

        {loading ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            {t("configEditor.loading")}
          </div>
        ) : loadError ? (
          <div className="py-12 text-center text-sm text-fail">❌ {loadError}</div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="min-h-[340px] flex-1 resize-none rounded-lg border border-border bg-bg-primary p-3 font-mono text-xs leading-relaxed text-text-primary focus:border-accent focus:outline-none"
            />
            {jsonError && (
              <p className="mt-2 break-all text-xs text-fail">
                ⚠️ {t("configEditor.invalidJson")}: {jsonError}
              </p>
            )}
            {saveError && <p className="mt-2 break-all text-xs text-fail">❌ {saveError}</p>}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-text-tertiary">{t("configEditor.backupNote")}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={onClose}>
                  {t("configEditor.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={save}
                  disabled={saving || !dirty || !!jsonError}
                  title={!dirty ? t("configEditor.noChanges") : undefined}
                >
                  {saving ? t("configEditor.saving") : t("configEditor.save")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

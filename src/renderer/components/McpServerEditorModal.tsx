import { useState } from "react";
import type { McpServerRecord } from "../types";
import { useLocale } from "../i18n/LocaleProvider";
import { Button } from "./Button";

interface Props {
  tool: string;
  /** When set, the modal edits an existing server (name is locked). */
  initial?: McpServerRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

const NEW_TEMPLATE = `{
  "command": "npx",
  "args": []
}`;

/** Add or edit a single MCP server entry (name + JSON config) for a tool. */
export function McpServerEditorModal({ tool, initial, onClose, onSaved }: Props) {
  const { t } = useLocale();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [entryText, setEntryText] = useState(
    initial ? JSON.stringify(initial.entry, null, 2) : NEW_TEMPLATE,
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jsonError = (() => {
    try {
      const parsed = JSON.parse(entryText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return t("mcpServerEditor.invalidJson");
      }
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  })();

  const canSave = !!name.trim() && !jsonError && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const entry = JSON.parse(entryText) as Record<string, unknown>;
    const res = await window.api.mcpUpsertServer(tool, name.trim(), entry, enabled);
    setSaving(false);
    if (res.success) {
      onSaved();
      onClose();
    } else {
      setError(res.error ?? "Save failed");
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
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-bg-card p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          {isEdit ? t("mcpServerEditor.editTitle") : t("mcpServerEditor.addTitle")}
        </h2>

        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("mcpServerEditor.name")}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={isEdit}
          autoFocus={!isEdit}
          className="mb-3 h-9 w-full rounded-lg border border-border bg-bg-primary px-2.5 text-[13px] text-text-primary read-only:opacity-60 focus:border-accent focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {t("mcpServerEditor.config")}
        </label>
        <textarea
          value={entryText}
          onChange={(e) => setEntryText(e.target.value)}
          spellCheck={false}
          className="min-h-[180px] flex-1 resize-none rounded-lg border border-border bg-bg-primary p-3 font-mono text-xs leading-relaxed text-text-primary focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-text-tertiary">{t("mcpServerEditor.hint")}</p>
        {jsonError && (
          <p className="mt-1 break-all text-xs text-fail">⚠️ {jsonError}</p>
        )}

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-accent"
          />
          {t("mcpServerEditor.enabled")}
        </label>

        {error && <p className="mt-2 break-all text-xs text-fail">❌ {error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("mcpServerEditor.cancel")}
          </Button>
          <Button size="sm" variant="primary" onClick={save} disabled={!canSave}>
            {saving ? t("mcpServerEditor.saving") : t("mcpServerEditor.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

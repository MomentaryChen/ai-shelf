import { AlertTriangle, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { McpServerRecord } from "../types";
import { useLocale } from "../i18n/LocaleProvider";

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col border-border bg-bg-card text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-sm text-text-primary">
            {isEdit ? t("mcpServerEditor.editTitle") : t("mcpServerEditor.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1 text-xs text-text-secondary">{t("mcpServerEditor.name")}</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isEdit}
              autoFocus={!isEdit}
              className="border-border bg-bg-primary text-[13px] read-only:opacity-60"
            />
          </div>

          <div>
            <Label className="mb-1 text-xs text-text-secondary">{t("mcpServerEditor.config")}</Label>
            <Textarea
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              spellCheck={false}
              className="min-h-[180px] flex-1 resize-none border-border bg-bg-primary font-mono text-xs leading-relaxed text-text-primary"
            />
            <p className="mt-1 text-[11px] text-text-tertiary">{t("mcpServerEditor.hint")}</p>
            {jsonError && (
              <p className="mt-1 inline-flex items-start gap-1 break-all text-xs text-fail">
                <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {jsonError}
              </p>
            )}
          </div>

          <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal text-text-primary">
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
            {t("mcpServerEditor.enabled")}
          </Label>

          {error && (
            <p className="inline-flex items-start gap-1 break-all text-xs text-fail">
              <XCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("mcpServerEditor.cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave}>
            {saving ? t("mcpServerEditor.saving") : t("mcpServerEditor.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

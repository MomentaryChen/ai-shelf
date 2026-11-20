import { useMemo } from "react";
import type { InstructionPreviewItem } from "../../shared/instruction-files.js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { computeLineDiff, MAX_DIFF_LINES } from "../utils/diff-tools";
import { Badge } from "./Badge";
import { LineDiffView } from "./LineDiffView";

const ACTION_VARIANT = {
  create: "ok",
  overwrite: "warn",
  unchanged: "neutral",
  blocked: "fail",
} as const;

const ACTION_KEY: Record<InstructionPreviewItem["action"], MessageKey> = {
  create: "instructions.preview.action.create",
  overwrite: "instructions.preview.action.overwrite",
  unchanged: "instructions.preview.action.unchanged",
  blocked: "instructions.preview.action.blocked",
};

function ItemDiff({ item }: { item: InstructionPreviewItem }) {
  const { t } = useLocale();
  const diff = useMemo(
    () => computeLineDiff(item.currentContent, item.nextContent),
    [item.currentContent, item.nextContent],
  );
  if (!diff.ok) {
    return <p className="px-3 py-2 text-xs text-fail">{t("diff.error.tooLarge", { max: MAX_DIFF_LINES })}</p>;
  }
  if (diff.result.identical) {
    // Same lines, different bytes (line endings / trailing newline).
    return <p className="px-3 py-2 text-xs text-text-tertiary">{t("instructions.preview.whitespaceOnly")}</p>;
  }
  return <LineDiffView lines={diff.result.lines} />;
}

function itemStats(item: InstructionPreviewItem): string | null {
  const diff = computeLineDiff(item.currentContent, item.nextContent);
  if (!diff.ok) return null;
  return `+${diff.result.added} −${diff.result.removed}`;
}

export function InstructionSyncPreviewDialog({
  open,
  sourceLabel,
  items,
  applying,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  sourceLabel: string;
  items: InstructionPreviewItem[];
  applying: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const writes = items.filter((i) => i.action === "create" || i.action === "overwrite");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !applying && onCancel()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border-border bg-bg-card text-text-primary">
        <DialogHeader>
          <DialogTitle>{t("instructions.preview.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">
          {t("instructions.preview.hint", { source: sourceLabel })}
        </p>

        <ul className="space-y-2">
          {items.map((item) => {
            const writable = item.action === "create" || item.action === "overwrite";
            const stats = writable ? itemStats(item) : null;
            return (
              <li
                key={`${item.ref.kindId}:${item.ref.rulePath ?? ""}`}
                className="rounded-lg border border-border bg-bg-primary/40 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge text={t(ACTION_KEY[item.action])} variant={ACTION_VARIANT[item.action]} />
                  <span className="min-w-0 flex-1 break-all font-mono text-xs text-text-primary">
                    {item.path}
                  </span>
                  {stats && <span className="tabular-nums text-xs text-text-tertiary">{stats}</span>}
                </div>
                {item.reason && (
                  <p className="mt-1 text-xs text-text-tertiary">
                    {item.reason === "same-as-source"
                      ? t("instructions.preview.reason.same")
                      : t("instructions.preview.reason.duplicate")}
                  </p>
                )}
                {writable && (
                  <details className="mt-1.5" open={items.length === 1}>
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      {t("healthMonitor.mcpPreviewShowDiff")}
                    </summary>
                    <div className="mt-1.5 max-h-[300px] overflow-auto rounded-xl border border-border bg-bg-primary">
                      <ItemDiff item={item} />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-text-tertiary">{t("instructions.preview.backupNote")}</p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={applying}>
            {t("healthMonitor.mcpPreviewCancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={applying || writes.length === 0}>
            {applying
              ? t("inventory.diffFix.syncing")
              : t("instructions.preview.confirm", { count: writes.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

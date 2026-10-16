import { useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";
import { buildPastePreview, type PasteStats } from "../terminal/paste-confirm";

const PREVIEW_MAX_LINES = 12;

export interface PendingPaste {
  text: string;
  stats: PasteStats;
  /** Session ids that will receive the paste (more than one when broadcasting). */
  targets: string[];
  /** False when any target pane has not enabled bracketed paste mode. */
  bracketed: boolean;
}

export function PasteConfirmDialog({
  pending,
  onCancel,
  onPaste,
  onPasteSingleLine,
}: {
  pending: PendingPaste | null;
  onCancel: () => void;
  onPaste: () => void;
  onPasteSingleLine: () => void;
}) {
  const { t } = useLocale();
  const pasteRef = useRef<HTMLButtonElement>(null);
  const preview = useMemo(
    () => (pending ? buildPastePreview(pending.text, PREVIEW_MAX_LINES) : null),
    [pending],
  );

  const broadcastCount = pending && pending.targets.length > 1 ? pending.targets.length : 0;
  const stats = pending?.stats;

  return (
    <Dialog open={pending !== null} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className="max-w-lg"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          pasteRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {broadcastCount > 0
              ? t("terminal.pasteConfirm.titleBroadcast", { count: broadcastCount })
              : t("terminal.pasteConfirm.title")}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {t("terminal.pasteConfirm.stats", {
              lines: stats?.lines ?? 0,
              chars: (stats?.chars ?? 0).toLocaleString(),
            })}
          </DialogDescription>
        </DialogHeader>

        {broadcastCount > 0 && (
          <p className="rounded-lg border border-chrome-ui-accent/30 bg-chrome-ui-accent/10 px-3 py-2 text-[12px] leading-snug text-chrome-accent-text">
            {t("terminal.pasteConfirm.broadcastNote", { count: broadcastCount })}
          </p>
        )}

        {pending && stats?.hasNewline && !pending.bracketed && (
          <p className="flex items-start gap-2 text-[12px] leading-snug text-chrome-text-muted">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
            <span>{t("terminal.pasteConfirm.unbracketedWarning")}</span>
          </p>
        )}

        {preview && (
          <div>
            <pre className="max-h-64 overflow-auto overscroll-contain whitespace-pre-wrap break-all rounded-lg border border-chrome-border-subtle bg-chrome-surface p-3 font-mono text-[11px] leading-snug text-chrome-text">
              {preview.text}
            </pre>
            {preview.truncated && (
              <p className="mt-1 text-[11px] text-chrome-text-dim">
                {t("terminal.pasteConfirm.previewTruncated")}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("profile.dialog.cancel")}
          </Button>
          {stats?.hasNewline && (
            <Button type="button" variant="chromeOutline" size="sm" onClick={onPasteSingleLine}>
              {t("terminal.pasteConfirm.singleLine")}
            </Button>
          )}
          <Button ref={pasteRef} type="button" variant="chromeSolid" size="sm" onClick={onPaste}>
            {broadcastCount > 0
              ? t("terminal.pasteConfirm.pasteBroadcast", { count: broadcastCount })
              : t("terminal.pasteConfirm.paste")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useRef } from "react";
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
import { buildPastePreview } from "../terminal/paste-confirm";
import { formatByteSize } from "../terminal/osc52";

const PREVIEW_MAX_LINES = 10;

export interface PendingOsc52 {
  text: string;
  bytes: number;
}

/**
 * Ask before a program in the pane writes to the clipboard (OSC 52, "ask" mode).
 * Focus starts on Deny: the request arrives unprompted, so an Enter the user
 * was typing into the terminal must not approve it.
 */
export function Osc52ConfirmDialog({
  pending,
  onDeny,
  onAllow,
}: {
  pending: PendingOsc52 | null;
  onDeny: () => void;
  onAllow: () => void;
}) {
  const { t } = useLocale();
  const denyRef = useRef<HTMLButtonElement>(null);
  const preview = useMemo(
    () => (pending ? buildPastePreview(pending.text, PREVIEW_MAX_LINES) : null),
    [pending],
  );

  return (
    <Dialog open={pending !== null} onOpenChange={(next) => !next && onDeny()}>
      <DialogContent
        className="max-w-lg"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          denyRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t("terminal.osc52.title")}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {t("terminal.osc52.desc", {
              size: formatByteSize(pending?.bytes ?? 0),
              chars: (pending?.text.length ?? 0).toLocaleString(),
            })}
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <div>
            <pre className="max-h-56 overflow-auto overscroll-contain whitespace-pre-wrap break-all rounded-lg border border-chrome-border-subtle bg-chrome-surface p-3 font-mono text-[11px] leading-snug text-chrome-text">
              {preview.text}
            </pre>
            {preview.truncated && (
              <p className="mt-1 text-[11px] text-chrome-text-dim">
                {t("terminal.pasteConfirm.previewTruncated")}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="hidden text-[11px] text-chrome-text-dim sm:block">{t("terminal.osc52.hint")}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={denyRef} type="button" variant="ghost" size="sm" onClick={onDeny}>
              {t("terminal.osc52.deny")}
            </Button>
            <Button type="button" variant="chromeSolid" size="sm" onClick={onAllow}>
              {t("terminal.osc52.allow")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

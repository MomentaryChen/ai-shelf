import { useRef } from "react";
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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant = "chromeSolid",
  defaultFocus = "confirm",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "chromeSolid" | "destructive";
  /** Prefer cancel for destructive confirmations so Enter does not dismiss a busy pane by accident. */
  defaultFocus?: "cancel" | "confirm";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLocale();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className="max-w-sm"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (defaultFocus === "cancel") cancelRef.current?.focus();
          else confirmRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-[13px] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("profile.dialog.cancel")}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

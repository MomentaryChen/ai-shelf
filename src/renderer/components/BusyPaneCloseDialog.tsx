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

export function BusyPaneCloseDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLocale();
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className="max-w-sm"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t("pane.closeBusyTitle")}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {t("pane.closeBusyConfirm")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t("profile.dialog.cancel")}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="chromeSolid"
            size="sm"
            onClick={onConfirm}
          >
            {t("pane.closeBusyAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

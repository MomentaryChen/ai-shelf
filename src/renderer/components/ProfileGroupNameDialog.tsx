import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  title: string;
  initialName?: string;
  submitLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export function ProfileGroupNameDialog({
  open,
  title,
  initialName = "",
  submitLabel,
  busy = false,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useLocale();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("profileGroup.namePlaceholder")}
          className="h-9 w-full rounded-lg border border-chrome-border-input bg-chrome-surface-focus px-2.5 text-[13px] text-chrome-text focus:border-chrome-border-focus focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
          }}
        />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("profile.dialog.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() => onSubmit(name.trim())}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

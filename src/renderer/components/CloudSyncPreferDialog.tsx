import { useEffect, useState, type ReactNode } from "react";
import { Cloud, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SyncConflictPreference } from "../../shared/sync-types.js";
import { useLocale } from "../i18n/LocaleProvider";

type PreferSide = Exclude<SyncConflictPreference, "merge">;

export function CloudSyncPreferDialog({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (prefer: PreferSide) => void;
}) {
  const { t } = useLocale();
  const [prefer, setPrefer] = useState<PreferSide>("local");

  useEffect(() => {
    if (open) setPrefer("local");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="max-w-sm" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("settings.accountSyncPreferTitle")}</DialogTitle>
        </DialogHeader>

        <p className="text-[13px] leading-snug text-chrome-text-muted">
          {t("settings.accountSyncPreferHint")}
        </p>

        <div
          role="radiogroup"
          aria-label={t("settings.accountSyncPreferTitle")}
          className="flex flex-col gap-2"
        >
          <PreferOption
            selected={prefer === "local"}
            disabled={busy}
            icon={<HardDrive className="size-4 shrink-0" aria-hidden />}
            title={t("settings.accountSyncPreferLocal")}
            description={t("settings.accountSyncPreferLocalDesc")}
            onSelect={() => setPrefer("local")}
          />
          <PreferOption
            selected={prefer === "cloud"}
            disabled={busy}
            icon={<Cloud className="size-4 shrink-0" aria-hidden />}
            title={t("settings.accountSyncPreferCloud")}
            description={t("settings.accountSyncPreferCloudDesc")}
            onSelect={() => setPrefer("cloud")}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t("profile.dialog.cancel")}
          </Button>
          <Button
            variant="chromeSolid"
            size="sm"
            disabled={busy}
            onClick={() => onConfirm(prefer)}
          >
            {busy ? t("settings.accountSyncing") : t("settings.accountSyncPreferConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreferOption({
  selected,
  disabled,
  icon,
  title,
  description,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
        selected
          ? "border-chrome-ui-accent bg-chrome-hover text-chrome-text"
          : "border-chrome-border bg-chrome-surface text-chrome-text-secondary hover:border-chrome-border-hover hover:bg-chrome-hover"
      }`}
    >
      <span
        className={`mt-0.5 ${selected ? "text-chrome-ui-accent" : "text-chrome-text-muted"}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-chrome-text">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-chrome-text-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

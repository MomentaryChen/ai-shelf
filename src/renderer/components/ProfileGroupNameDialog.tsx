import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-chrome-border bg-chrome-surface p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-chrome-text">{title}</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("profileGroup.namePlaceholder")}
          className="mb-4 h-9 w-full rounded-lg border border-chrome-border-input bg-[#131316] px-2.5 text-[13px] text-chrome-text focus:border-chrome-border-focus focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-[12px] text-chrome-text-dim hover:bg-white/5"
            onClick={onClose}
            disabled={busy}
          >
            {t("profile.dialog.cancel")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            disabled={busy || !name.trim()}
            onClick={() => onSubmit(name.trim())}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

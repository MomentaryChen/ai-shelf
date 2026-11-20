import { useEffect, useState, type ReactNode } from "react";
import { CircleHelp, ExternalLink, Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";
import { RELEASES_URL } from "../app-updated-notice";

export const REPO_URL = "https://github.com/MomentaryChen/ai-shelf";
const AUTHOR = "momentary";

export function HelpDialog({
  open,
  onClose,
  onOpenShortcuts,
  tone = "default",
}: {
  open: boolean;
  onClose: () => void;
  onOpenShortcuts: () => void;
  tone?: "default" | "chrome";
}) {
  const { t } = useLocale();
  const [version, setVersion] = useState<string | null>(null);
  const chrome = tone === "chrome";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    window.api
      .getAppUpdateState()
      .then((s) => {
        if (!cancelled) setVersion(s.currentVersion || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const muted = chrome ? "text-chrome-text-muted" : "text-muted";
  const rowHover = chrome ? "hover:bg-chrome-hover/60" : "hover:bg-cream/80";

  const linkButton = (label: string, href: string) => (
    <button
      type="button"
      onClick={() => void window.api.openExternal(href)}
      className={`inline-flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline ${
        chrome ? "text-chrome-text" : "text-ink"
      }`}
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </button>
  );

  const row = (label: string, value: ReactNode) => (
    <li
      className={`flex items-center justify-between gap-3 rounded-[14px] px-2.5 py-1.5 text-[13px] ${rowHover}`}
    >
      <span className={muted}>{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={
          chrome
            ? "max-w-md overflow-hidden border-chrome-border bg-chrome-surface p-0 text-chrome-text"
            : "max-w-md overflow-hidden rounded-[28px] border-border bg-surface p-0 text-ink warm-shadow-card"
        }
        showCloseButton
      >
        <DialogHeader
          className={`space-y-1 border-b px-5 py-4 text-left ${
            chrome ? "border-chrome-border-subtle" : "border-sand"
          }`}
        >
          <div className="flex items-center gap-2">
            <CircleHelp className={`h-4 w-4 ${muted}`} aria-hidden />
            <DialogTitle
              className={`text-[17px] font-semibold ${chrome ? "text-chrome-text" : "text-ink"}`}
            >
              {t("help.title")}
            </DialogTitle>
          </div>
          <p className={`text-[13px] leading-normal ${muted}`}>{t("help.subtitle")}</p>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-5 py-4">
          <ul className="flex flex-col gap-1">
            {row(t("help.version"), version ? `v${version}` : "—")}
            {row(t("help.author"), AUTHOR)}
            {row("GitHub", linkButton("MomentaryChen/ai-shelf", REPO_URL))}
            {row(t("help.releases"), linkButton(t("help.releasesLink"), RELEASES_URL))}
            {row(t("help.issues"), linkButton(t("help.issuesLink"), `${REPO_URL}/issues`))}
          </ul>
          <button
            type="button"
            onClick={onOpenShortcuts}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border px-3 py-2 text-[13px] transition-colors duration-150 ${
              chrome
                ? "border-chrome-border-strong bg-chrome-surface-raised text-chrome-text hover:bg-chrome-hover"
                : "border-border bg-bg-secondary text-text-primary hover:border-border-strong"
            }`}
          >
            <Keyboard className="h-4 w-4" aria-hidden />
            {t("cmd.action.shortcuts")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";
import { loadSettings } from "../chat-settings";
import { buildShortcutSections } from "../shortcuts/shortcut-registry";

export function ShortcutCheatsheet({
  open,
  onClose,
  tone = "default",
}: {
  open: boolean;
  onClose: () => void;
  tone?: "default" | "chrome";
}) {
  const { t } = useLocale();
  const sections = useMemo(
    () => buildShortcutSections(loadSettings().paneShortcuts),
    [open],
  );

  const chrome = tone === "chrome";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={
          chrome
            ? "max-h-[min(85vh,720px)] max-w-lg overflow-hidden border-chrome-border bg-chrome-surface p-0 text-chrome-text"
            : "max-h-[min(85vh,720px)] max-w-lg overflow-hidden rounded-[28px] border-border bg-surface p-0 text-ink warm-shadow-card"
        }
        showCloseButton
      >
        <DialogHeader
          className={`space-y-1 border-b px-5 py-4 text-left ${
            chrome ? "border-chrome-border-subtle" : "border-sand"
          }`}
        >
          <div className="flex items-center gap-2">
            <Keyboard
              className={`h-4 w-4 ${chrome ? "text-chrome-text-muted" : "text-muted"}`}
              aria-hidden
            />
            <DialogTitle
              className={`text-[17px] font-semibold ${chrome ? "text-chrome-text" : "text-ink"}`}
            >
              {t("shortcuts.title")}
            </DialogTitle>
          </div>
          <p
            className={`text-[13px] leading-normal ${chrome ? "text-chrome-text-muted" : "text-muted"}`}
          >
            {t("shortcuts.subtitle")}
          </p>
        </DialogHeader>
        <div className="max-h-[min(60vh,520px)] overflow-y-auto overscroll-y-contain px-5 py-4">
          <div className="flex flex-col gap-5">
            {sections.map((section) => (
              <section key={section.titleKey}>
                <h3
                  className={`mb-2 text-[11px] font-medium tracking-wide ${
                    chrome ? "text-chrome-text-muted" : "text-muted"
                  }`}
                >
                  {t(section.titleKey)}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {section.items.map((item) => (
                    <li
                      key={`${section.titleKey}-${item.labelKey}`}
                      className={`flex items-center justify-between gap-3 rounded-[14px] px-2.5 py-1.5 text-[13px] ${
                        chrome ? "hover:bg-chrome-hover/60" : "hover:bg-cream/80"
                      }`}
                    >
                      <span className={chrome ? "text-chrome-text" : "text-ink"}>
                        {t(item.labelKey)}
                      </span>
                      <kbd
                        className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
                          chrome
                            ? "border-chrome-border-subtle bg-chrome-surface-raised text-chrome-text-muted"
                            : "border-sand bg-cream text-ink"
                        }`}
                      >
                        {item.keys}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

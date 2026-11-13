import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useDismissibleSurface } from "../hooks/useDismissibleSurface";
import { useLocale } from "../i18n/LocaleProvider";
import {
  readLastSeenVersion,
  releaseNotesUrl,
  resolveUpdatedNotice,
  writeLastSeenVersion,
} from "../app-updated-notice";

/** Let the window settle after the relaunch before announcing. */
const SHOW_DELAY_MS = 1_500;
const VISIBLE_MS = 8_000;

/**
 * After a silent desktop update relaunches AI Shelf, confirm it landed:
 * a short, non-blocking "Updated to vX · What's new" toast.
 */
export function AppUpdatedToast() {
  const { t } = useLocale();
  const { item: version, exiting, show, hide } = useDismissibleSurface<string>();

  useEffect(() => {
    let cancelled = false;
    let showTimer: number | null = null;
    let hideTimer: number | null = null;

    void (async () => {
      try {
        const channel = await window.api.getAppUpdateChannel();
        if (cancelled || !channel.desktopAutoUpdate) return;
        const { currentVersion } = await window.api.getAppUpdateState();
        if (cancelled) return;
        const announce = resolveUpdatedNotice(readLastSeenVersion(), currentVersion);
        if (currentVersion && currentVersion !== "unknown" && currentVersion !== "0.0.0") {
          writeLastSeenVersion(currentVersion);
        }
        if (!announce) return;
        showTimer = window.setTimeout(() => {
          show(announce);
          hideTimer = window.setTimeout(hide, VISIBLE_MS);
        }, SHOW_DELAY_MS);
      } catch {
        /* best-effort notice */
      }
    })();

    return () => {
      cancelled = true;
      if (showTimer != null) window.clearTimeout(showTimer);
      if (hideTimer != null) window.clearTimeout(hideTimer);
    };
  }, [show, hide]);

  if (!version) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-[100] max-w-[min(340px,calc(100vw-1.5rem))]"
      role="status"
      aria-live="polite"
    >
      <div
        className={`${exiting ? "ui-toast-exit" : "ui-toast-enter"} flex items-start gap-2 rounded-lg border border-ok/45 bg-bg-card/95 px-3 py-2.5 text-[12px] text-text-primary shadow-lg backdrop-blur-sm`}
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="font-medium">{t("appUpdate.updatedTo", { version })}</p>
          <button
            type="button"
            className="mt-1 cursor-pointer text-[11px] text-accent hover:underline"
            onClick={() => {
              hide();
              void window.api.openExternal(releaseNotesUrl(version));
            }}
          >
            {t("appUpdate.viewWhatsNew")}
          </button>
        </div>
        <button
          type="button"
          aria-label={t("appUpdate.close")}
          className="shrink-0 cursor-pointer rounded p-0.5 text-text-tertiary hover:text-text-primary"
          onClick={hide}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

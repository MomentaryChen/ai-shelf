import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sanitizeReleaseNotesHtml } from "../utils/releaseNotesHtml";
import {
  resolveAppUpdateErrorKey,
  shortenAppUpdateErrorDetail,
} from "../utils/formatAppUpdateError";
import { useLocale } from "../i18n/LocaleProvider";
import { RELEASES_URL } from "../app-updated-notice";

type Phase = "hidden" | "confirm" | "downloading" | "ready" | "installing" | "error";

/** The app normally exits within a second of handing off to the installer. */
const INSTALL_STALLED_MS = 90_000;

/** Progress payloads report raw bytes; show the unit a human would read. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function AppUpdateModal() {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [installStalled, setInstallStalled] = useState(false);
  const [impact, setImpact] = useState<{ terminals: number } | null>(null);

  const releaseNotesHtml = useMemo(
    () => (releaseNotes ? sanitizeReleaseNotesHtml(releaseNotes) : null),
    [releaseNotes],
  );

  const errorSummaryKey = useMemo(
    () => resolveAppUpdateErrorKey(errorMessage),
    [errorMessage],
  );
  const errorDetail = useMemo(() => shortenAppUpdateErrorDetail(errorMessage), [errorMessage]);

  /**
   * Download and install must not be interrupted by a stray click or Esc — but never
   * trap the user: if the silent installer never takes over, unlock the modal again.
   */
  const locked = phase === "downloading" || (phase === "installing" && !installStalled);

  useEffect(() => {
    if (phase !== "installing") {
      setInstallStalled(false);
      return;
    }
    const timer = setTimeout(() => setInstallStalled(true), INSTALL_STALLED_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  /** While "ready" is showing, keep the "restart will close N terminals" line live. */
  useEffect(() => {
    if (phase !== "ready") {
      setImpact(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void window.api
        .getAppUpdateImpact()
        .then((next) => {
          if (!cancelled) setImpact(next);
        })
        .catch(() => {
          /* best-effort warning */
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase]);

  const dismiss = useCallback(() => {
    if (locked) return;
    setPhase("hidden");
    setErrorMessage(null);
  }, [locked]);

  useEffect(() => {
    let cancelled = false;
    void window.api.getAppUpdateChannel().then((ch) => {
      if (!cancelled) setEnabled(ch.desktopAutoUpdate);
    });
    void window.api.getAppUpdateState().then((s) => {
      if (!cancelled) setCurrentVersion(s.currentVersion || null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const unsubAvailable = window.api.onAppUpdateAvailable((payload) => {
      setVersion(payload.version);
      setReleaseNotes(payload.releaseNotes);
      setPhase("confirm");
      setErrorMessage(null);
    });

    const unsubNotAvailable = window.api.onAppUpdateNotAvailable(() => {
      setPhase((p) => (p === "confirm" ? "hidden" : p));
    });

    const unsubProgress = window.api.onAppUpdateProgress((payload) => {
      setPhase("downloading");
      setPercent(payload.percent);
      setTransferred(payload.transferred ?? 0);
      setTotal(payload.total ?? 0);
    });

    const unsubDownloaded = window.api.onAppUpdateDownloaded((payload) => {
      setVersion((v) => payload.version ?? v);
      setPercent(100);
      setPhase("ready");
    });

    const unsubInstalling = window.api.onAppUpdateInstalling((payload) => {
      setVersion((v) => payload.version ?? v);
      setPhase("installing");
    });

    const unsubError = window.api.onAppUpdateError((payload) => {
      setErrorMessage(payload.message);
      setPhase("error");
    });

    return () => {
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubInstalling();
      unsubError();
    };
  }, [enabled]);

  const onReleaseNotesClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href");
    if (!href || !/^https?:\/\//i.test(href)) return;
    e.preventDefault();
    void window.api.openExternal(href);
  };

  const startDownload = () => {
    setPhase("downloading");
    setPercent(0);
    setTransferred(0);
    setTotal(0);
    setErrorMessage(null);
    void window.api.confirmAppUpdateDownload();
  };

  const restartToInstall = () => {
    setPhase("installing");
    void window.api.quitAndInstallAppUpdate();
  };

  const retryCheck = () => {
    setErrorMessage(null);
    setPhase("hidden");
    void window.api.checkAppUpdate();
  };

  if (!enabled) return null;

  const open = phase !== "hidden";

  const heroIcon =
    phase === "ready" ? (
      <CheckCircle2 className="size-6" />
    ) : phase === "installing" ? (
      <Loader2 className="size-6 animate-spin" />
    ) : phase === "error" ? (
      <AlertTriangle className="size-6" />
    ) : phase === "downloading" ? (
      <Download className="size-6" />
    ) : (
      <Sparkles className="size-6" />
    );

  const heroTone =
    phase === "error"
      ? "bg-fail/12 text-fail"
      : phase === "ready"
        ? "bg-ok/12 text-ok"
        : "bg-accent-soft text-accent";

  const title =
    phase === "ready"
      ? t("appUpdate.ready")
      : phase === "installing"
        ? t("appUpdate.installing")
        : phase === "error"
          ? t("appUpdate.failed")
          : phase === "downloading"
            ? t("appUpdate.downloading")
            : t("appUpdate.available");

  const subtitle =
    phase === "ready"
      ? t("appUpdate.restartFinish")
      : phase === "installing"
        ? t("appUpdate.installingHint")
        : phase === "error"
          ? t("appUpdate.errorSubtitle")
          : phase === "downloading"
            ? t("appUpdate.downloadingHint")
            : t("appUpdate.newVersion");

  const showVersionRow = phase !== "error" && Boolean(version);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        showCloseButton={!locked}
        className="flex max-h-[min(90vh,38rem)] max-w-lg flex-col gap-0 overflow-hidden border-border bg-bg-card p-0 text-text-primary"
        onPointerDownOutside={(e) => {
          if (locked) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (locked) e.preventDefault();
        }}
      >
        <DialogHeader className="relative shrink-0 space-y-0 overflow-hidden border-b border-border px-6 pb-5 pt-6 text-left">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-20 h-36 bg-[radial-gradient(65%_100%_at_50%_100%,var(--color-accent-soft),transparent)]"
          />
          <div className="relative flex items-start gap-4">
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${heroTone}`}
            >
              {heroIcon}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold leading-tight text-text-primary">
                {title}
              </DialogTitle>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{subtitle}</p>
            </div>
          </div>

          {showVersionRow && (
            <div className="relative mt-4 flex items-center gap-2 text-xs">
              {currentVersion && (
                <>
                  <span className="rounded-full border border-border px-2.5 py-1 font-mono text-text-secondary">
                    v{currentVersion}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-text-secondary" />
                </>
              )}
              <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono font-semibold text-accent">
                v{version}
              </span>
            </div>
          )}
        </DialogHeader>

        <div className="warm-rise min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {phase === "confirm" && (
            <>
              {releaseNotesHtml ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    {t("appUpdate.whatsNew")}
                  </p>
                  <div
                    className="release-notes mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-bg-primary/60 p-4 text-xs leading-relaxed text-text-secondary"
                    onClick={onReleaseNotesClick}
                    dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
                  />
                </>
              ) : (
                <p className="text-sm text-text-secondary">{t("appUpdate.downloadPrompt")}</p>
              )}
              <p className="mt-4 text-xs leading-relaxed text-text-secondary">
                {t("appUpdate.silentInstallNote")}
              </p>
            </>
          )}

          {phase === "downloading" && (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-3xl font-semibold tabular-nums text-text-primary">
                  {percent}%
                </span>
                {total > 0 && (
                  <span className="font-mono text-xs tabular-nums text-text-secondary">
                    {formatBytes(transferred)} / {formatBytes(total)}
                  </span>
                )}
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="warm-clay-gradient h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
              </div>
            </>
          )}

          {phase === "ready" && (
            <>
              <p className="text-sm leading-relaxed text-text-secondary">
                {t("appUpdate.downloadComplete")}
                {version ? ` (v${version})` : ""}. {t("appUpdate.silentInstallNote")}
              </p>
              {impact && impact.terminals > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/8 px-3 py-2.5 text-xs leading-relaxed text-text-primary">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                  <span>
                    {t("appUpdate.impactTerminals", { terminals: impact.terminals })}
                  </span>
                </div>
              )}
            </>
          )}

          {phase === "installing" && (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-primary/60 px-4 py-3">
                <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
                <p className="text-sm text-text-secondary">{t("appUpdate.installingBody")}</p>
              </div>
              {installStalled && (
                <p className="mt-3 text-xs leading-relaxed text-warn">
                  {t("appUpdate.installStalledHint")}
                </p>
              )}
            </>
          )}

          {phase === "error" && (
            <>
              <p className="text-sm text-fail">{t(errorSummaryKey)}</p>
              {errorDetail && (
                <details
                  className="mt-3 text-xs text-text-secondary"
                  open={errorSummaryKey === "appUpdate.errorDefault"}
                >
                  <summary className="cursor-pointer select-none text-text-primary">
                    {t("appUpdate.errorDetail")}
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-xl border border-border bg-bg-primary/60 p-3 font-mono text-[11px] leading-snug">
                    {errorDetail}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>

        {phase === "confirm" && (
          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={dismiss}>
              {t("appUpdate.later")}
            </Button>
            <Button type="button" onClick={startDownload}>
              <Download className="size-4" />
              {t("appUpdate.now")}
            </Button>
          </DialogFooter>
        )}

        {phase === "ready" && (
          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={dismiss}>
              {t("appUpdate.restartLater")}
            </Button>
            <Button type="button" onClick={restartToInstall}>
              <RefreshCw className="size-4" />
              {t("appUpdate.restartNow")}
            </Button>
          </DialogFooter>
        )}

        {phase === "error" && (
          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={dismiss}>
              {t("appUpdate.close")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void window.api.openExternal(`${RELEASES_URL}/latest`)}
            >
              <ExternalLink className="size-4" />
              {t("appUpdate.manualDownload")}
            </Button>
            <Button type="button" onClick={retryCheck}>
              <RefreshCw className="size-4" />
              {t("appUpdate.retry")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

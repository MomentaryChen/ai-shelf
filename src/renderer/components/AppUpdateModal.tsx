import { useCallback, useEffect, useMemo, useState } from "react";
import { sanitizeReleaseNotesHtml } from "../utils/releaseNotesHtml";
import {
  resolveAppUpdateErrorKey,
  shortenAppUpdateErrorDetail,
} from "../utils/formatAppUpdateError";
import { useLocale } from "../i18n/LocaleProvider";
import { Button } from "./Button";

type Phase = "hidden" | "confirm" | "downloading" | "ready" | "error";

export function AppUpdateModal() {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [version, setVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const releaseNotesHtml = useMemo(
    () => (releaseNotes ? sanitizeReleaseNotesHtml(releaseNotes) : null),
    [releaseNotes],
  );

  const errorSummaryKey = useMemo(
    () => resolveAppUpdateErrorKey(errorMessage),
    [errorMessage],
  );
  const errorDetail = useMemo(() => shortenAppUpdateErrorDetail(errorMessage), [errorMessage]);

  const dismiss = useCallback(() => {
    if (phase === "downloading") return;
    setPhase("hidden");
    setErrorMessage(null);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    void window.api.getAppUpdateChannel().then((ch) => {
      if (!cancelled) setEnabled(ch.desktopAutoUpdate);
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
    });

    const unsubDownloaded = window.api.onAppUpdateDownloaded((payload) => {
      setVersion((v) => payload.version ?? v);
      setPercent(100);
      setPhase("ready");
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
    setErrorMessage(null);
    void window.api.confirmAppUpdateDownload();
  };

  const restartToInstall = () => {
    void window.api.quitAndInstallAppUpdate();
  };

  const retryCheck = () => {
    setErrorMessage(null);
    setPhase("hidden");
    void window.api.checkAppUpdate();
  };

  if (!enabled || phase === "hidden") return null;

  const title =
    phase === "ready"
      ? t("appUpdate.ready")
      : phase === "error"
        ? t("appUpdate.failed")
        : t("appUpdate.available");

  const footer =
    phase === "confirm" ? (
      <>
        <Button type="button" variant="secondary" onClick={dismiss}>
          {t("appUpdate.later")}
        </Button>
        <Button type="button" variant="primary" onClick={startDownload}>
          {t("appUpdate.now")}
        </Button>
      </>
    ) : phase === "ready" ? (
      <>
        <Button type="button" variant="secondary" onClick={dismiss}>
          {t("appUpdate.restartLater")}
        </Button>
        <Button type="button" variant="primary" onClick={restartToInstall}>
          {t("appUpdate.restartNow")}
        </Button>
      </>
    ) : phase === "error" ? (
      <>
        <Button type="button" variant="secondary" onClick={dismiss}>
          {t("appUpdate.close")}
        </Button>
        <Button type="button" variant="primary" onClick={retryCheck}>
          {t("appUpdate.retry")}
        </Button>
      </>
    ) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
    >
      <div className="flex max-h-[min(90vh,28rem)] w-full max-w-md flex-col rounded-xl border border-border bg-bg-card shadow-xl">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <h2 id="app-update-title" className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {phase === "confirm" && (
            <>
              <p className="text-sm text-text-secondary">
                {t("appUpdate.newVersion")}
                {version ? (
                  <>
                    {" "}
                    (<span className="font-mono text-accent">v{version}</span>)
                  </>
                ) : null}
                {t("appUpdate.downloadPrompt")}
              </p>
              {releaseNotesHtml && (
                <div
                  className="release-notes mt-3 max-h-36 overflow-y-auto rounded-lg bg-bg-primary/60 p-3 text-xs text-text-secondary"
                  onClick={onReleaseNotesClick}
                  dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
                />
              )}
            </>
          )}

          {phase === "downloading" && (
            <>
              <p className="text-sm text-text-secondary">
                {t("appUpdate.downloading")}
                {version ? ` v${version}` : ""}…
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
              </div>
              <p className="mt-2 text-center font-mono text-sm tabular-nums text-text-primary">
                {percent}%
              </p>
            </>
          )}

          {phase === "ready" && (
            <p className="text-sm text-text-secondary">
              {t("appUpdate.downloadComplete")}
              {version ? ` (v${version})` : ""}. {t("appUpdate.restartFinish")}
            </p>
          )}

          {phase === "error" && (
            <>
              <p className="text-sm text-fail">{t(errorSummaryKey)}</p>
              {errorDetail && errorSummaryKey === "appUpdate.errorDefault" && (
                <p className="mt-2 break-words font-mono text-xs text-text-secondary">{errorDetail}</p>
              )}
              {errorDetail && errorSummaryKey === "appUpdate.errorSignature" && (
                <details className="mt-3 text-xs text-text-secondary">
                  <summary className="cursor-pointer select-none text-text-primary">
                    {t("appUpdate.errorDetail")}
                  </summary>
                  <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-bg-primary/60 p-2 font-mono text-[11px] leading-snug">
                    {errorDetail}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>

        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { sanitizeReleaseNotesHtml } from "../utils/releaseNotesHtml";

type Phase = "hidden" | "confirm" | "downloading" | "ready" | "error";

export function AppUpdateModal() {
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-bg-card p-6 shadow-xl">
        <h2 id="app-update-title" className="mb-2 text-lg font-semibold text-text-primary">
          {phase === "ready" ? "Update ready" : phase === "error" ? "Update failed" : "Update available"}
        </h2>

        {phase === "confirm" && (
          <>
            <p className="mb-3 text-sm text-text-secondary">
              A new version of AI Shelf is available
              {version ? (
                <>
                  {" "}
                  (<span className="font-mono text-accent">v{version}</span>)
                </>
              ) : null}
              . Download now?
            </p>
            {releaseNotesHtml && (
              <div
                className="release-notes mb-4 max-h-40 overflow-y-auto rounded-lg bg-bg-primary/60 p-3 text-xs text-text-secondary"
                onClick={onReleaseNotesClick}
                dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent"
              >
                Later
              </button>
              <button
                type="button"
                onClick={startDownload}
                className="cursor-pointer rounded-lg border border-accent bg-accent/15 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/25"
              >
                Update now
              </button>
            </div>
          </>
        )}

        {phase === "downloading" && (
          <>
            <p className="mb-3 text-sm text-text-secondary">
              Downloading{version ? ` v${version}` : ""}…
            </p>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-bg-primary">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
            <p className="text-center font-mono text-sm tabular-nums text-text-primary">{percent}%</p>
          </>
        )}

        {phase === "ready" && (
          <>
            <p className="mb-4 text-sm text-text-secondary">
              Download complete{version ? ` (v${version})` : ""}. Restart AI Shelf to finish installing.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent"
              >
                Restart later
              </button>
              <button
                type="button"
                onClick={restartToInstall}
                className="cursor-pointer rounded-lg border border-accent bg-accent/15 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/25"
              >
                Restart now
              </button>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <p className="mb-4 text-sm text-fail">{errorMessage ?? "Could not check or download the update."}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent"
              >
                Close
              </button>
              <button
                type="button"
                onClick={retryCheck}
                className="cursor-pointer rounded-lg border border-accent bg-accent/15 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/25"
              >
                Retry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

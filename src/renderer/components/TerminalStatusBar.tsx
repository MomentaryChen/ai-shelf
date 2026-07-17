import { useEffect, useState } from "react";
import type { PaneInfo } from "../terminal/split-tree";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

type SessionStatus = "live" | "exited" | "stale";

type PtyMetaView = {
  pid: number | null;
  shell: string | null;
  cols: number | null;
  rows: number | null;
  exitCode: number | null;
};

const STATUS_DOT: Record<SessionStatus, string> = {
  live: "bg-ok",
  exited: "bg-chrome-text-dim",
  stale: "bg-warn",
};

const STATUS_LABEL: Record<SessionStatus, MessageKey> = {
  live: "status.live",
  exited: "status.exited",
  stale: "status.stale",
};

const EMPTY_META: PtyMetaView = {
  pid: null,
  shell: null,
  cols: null,
  rows: null,
  exitCode: null,
};

function formatSize(cols: number | null, rows: number | null): string | null {
  if (cols == null || rows == null) return null;
  return `${cols}×${rows}`;
}

/** Bottom status strip — cwd, real shell, pid, size, exit (Part I desktop chrome). */
export function TerminalStatusBar({ pane }: { pane: PaneInfo | null }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<SessionStatus>("live");
  const [meta, setMeta] = useState<PtyMetaView>(EMPTY_META);

  useEffect(() => {
    if (!pane?.sessionId) {
      setStatus("live");
      setMeta(EMPTY_META);
      return;
    }

    const sessionId = pane.sessionId;
    let cancelled = false;
    setStatus("live");
    setMeta(EMPTY_META);

    // Subscribe before attach so we do not miss exit / meta that race the IPC round-trip.
    const offExit = window.api.onPtyExit(({ sessionId: sid, exitCode }) => {
      if (sid !== sessionId) return;
      setStatus("exited");
      setMeta((prev) => ({ ...prev, exitCode }));
    });

    const offMeta = window.api.onPtyMeta((payload) => {
      if (payload.sessionId !== sessionId) return;
      setMeta({
        pid: payload.pid,
        shell: payload.shell,
        cols: payload.cols,
        rows: payload.rows,
        exitCode: payload.exitCode,
      });
      setStatus((prev) => {
        if (payload.exitCode != null) return "exited";
        if (!payload.alive) return prev === "exited" ? "exited" : "stale";
        return prev === "exited" ? "exited" : "live";
      });
    });

    void window.api.ptyAttach(sessionId).then((r) => {
      if (cancelled) return;
      // Merge carefully: a late attach reply must not wipe exitCode set by onPtyExit.
      setMeta((prev) => ({
        pid: r.pid ?? prev.pid,
        shell: r.shell ?? prev.shell,
        cols: r.cols ?? prev.cols,
        rows: r.rows ?? prev.rows,
        exitCode: prev.exitCode ?? r.exitCode,
      }));
      setStatus((prev) => {
        if (prev === "exited" || r.exitCode != null) return "exited";
        return r.alive ? "live" : "stale";
      });
    });

    return () => {
      cancelled = true;
      offExit();
      offMeta();
    };
  }, [pane?.sessionId]);

  if (!pane) return null;

  const cwd = pane.cwd?.trim() || "—";
  const shell = meta.shell?.trim() || "—";
  const size = formatSize(meta.cols, meta.rows);
  const pidLabel = meta.pid != null ? String(meta.pid) : "—";
  const showExit = status === "exited" || meta.exitCode != null;

  return (
    <div
      className="flex h-6 shrink-0 items-center gap-3 border-t border-chrome-border bg-chrome-bg px-3 text-[11px] text-chrome-text-muted"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
        <span className="shrink-0 text-chrome-text-subtle">{t(STATUS_LABEL[status])}</span>
      </span>
      <span className="min-w-0 truncate font-mono tabular-nums" title={cwd}>
        {cwd}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3 font-mono tabular-nums text-chrome-text-subtle">
        <span title={t("status.shell")}>{shell}</span>
        {size ? <span title={t("status.size")}>{size}</span> : null}
        <span title={t("status.pid")}>
          {t("status.pid")} {pidLabel}
        </span>
        {showExit ? (
          <span title={t("status.exit")}>
            {t("status.exit")} {meta.exitCode ?? "—"}
          </span>
        ) : null}
      </span>
    </div>
  );
}

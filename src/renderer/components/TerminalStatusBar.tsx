import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PaneInfo } from "../terminal/split-tree";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { TerminalCommandStatus } from "./TerminalCommandStatus";
import { TerminalGitStatus } from "./TerminalGitStatus";

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

const COPIED_FLASH_MS = 1400;

/**
 * Bottom status strip for the focused pane — session state, cwd (click to copy),
 * git branch (click for the worktree dialog), last command, shell, exit code.
 * Pid and grid size are diagnostics, so they live in the shell tooltip.
 */
export function TerminalStatusBar({
  pane,
  onOpenWorktree,
}: {
  pane: PaneInfo | null;
  /** Makes the branch segment a button that opens the worktree dialog for this pane. */
  onOpenWorktree?: (paneId: string) => void;
}) {
  const { t } = useLocale();
  const [status, setStatus] = useState<SessionStatus>("live");
  const [meta, setMeta] = useState<PtyMetaView>(EMPTY_META);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );
  useEffect(() => setCopied(false), [pane?.id, pane?.cwd]);

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

    void window.api.ptyAttach(sessionId, { includeBuffer: false }).then((r) => {
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

  const cwdPath = pane.cwd?.trim() || "";
  const shell = meta.shell?.trim() || "—";
  const size = formatSize(meta.cols, meta.rows);
  const showExit = status === "exited" || meta.exitCode != null;
  const shellTitle = [
    `${t("status.shell")}: ${shell}`,
    size ? `${t("status.size")}: ${size}` : "",
    meta.pid != null ? `${t("status.pid")}: ${meta.pid}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const copyCwd = () => {
    if (!cwdPath) return;
    void window.api.clipboardWriteText(cwdPath).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS);
    });
  };
  const paneId = pane.id;

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
      {cwdPath ? (
        <button
          type="button"
          onClick={copyCwd}
          className="group/cwd inline-flex min-w-0 cursor-pointer items-center gap-1 rounded px-1 font-mono tabular-nums text-chrome-text-secondary transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
          title={`${cwdPath}\n\n${t("status.copyCwd")}`}
        >
          <span className="min-w-0 truncate">{cwdPath}</span>
          {copied ? (
            <Check className="h-3 w-3 shrink-0 text-ok" aria-label={t("status.cwdCopied")} />
          ) : (
            <Copy
              className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/cwd:opacity-70 group-focus-visible/cwd:opacity-70"
              aria-hidden
            />
          )}
        </button>
      ) : (
        <span className="font-mono">—</span>
      )}
      <TerminalGitStatus
        cwd={pane.cwd}
        onClick={onOpenWorktree ? () => onOpenWorktree(paneId) : undefined}
      />
      <span className="ml-auto flex shrink-0 items-center gap-3 font-mono tabular-nums text-chrome-text-subtle">
        <TerminalCommandStatus sessionId={pane.sessionId} />
        <span title={shellTitle}>{shell}</span>
        {showExit ? (
          <span title={t("status.exit")}>
            {t("status.exit")} {meta.exitCode ?? "—"}
          </span>
        ) : null}
      </span>
    </div>
  );
}

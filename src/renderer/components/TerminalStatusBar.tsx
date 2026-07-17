import { useEffect, useState } from "react";
import type { PaneInfo } from "../terminal/split-tree";
import { profileToolLabel } from "../utils/available-tools";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

type SessionStatus = "live" | "exited" | "stale";

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

/** Bottom status strip — path, shell type, live/exited/stale session (Part I desktop chrome). */
export function TerminalStatusBar({ pane }: { pane: PaneInfo | null }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<SessionStatus>("live");

  useEffect(() => {
    if (!pane?.sessionId) {
      setStatus("live");
      return;
    }

    const sessionId = pane.sessionId;
    let cancelled = false;
    setStatus("live");

    // Subscribe before attach so we do not miss an exit that races the IPC round-trip.
    const offExit = window.api.onPtyExit(({ sessionId: sid }) => {
      if (sid !== sessionId) return;
      setStatus("exited");
    });

    void window.api.ptyAttach(sessionId).then((r) => {
      if (cancelled) return;
      setStatus((prev) => {
        if (prev === "exited") return prev;
        return r.alive ? "live" : "stale";
      });
    });

    return () => {
      cancelled = true;
      offExit();
    };
  }, [pane?.sessionId]);

  if (!pane) return null;

  const cwd = pane.cwd?.trim() || "—";
  const shell = profileToolLabel(pane.tool);

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
      <span className="ml-auto shrink-0 text-chrome-text-subtle">{shell}</span>
    </div>
  );
}

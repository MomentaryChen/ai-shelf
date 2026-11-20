import { useEffect, useState } from "react";
import type { AgentSessionUsage } from "../../shared/agent-session-usage.js";
import { useLocale } from "../i18n/LocaleProvider";
import {
  formatCompactTokens,
  formatExactTokens,
  formatSessionCost,
} from "../terminal/session-usage-format";

const USAGE_POLL_MS = 5000;

/**
 * Tokens and estimated cost of the agent conversation in a pane (Claude panes
 * with a pinned session id). Polls the main process, which reads only what the
 * transcript gained since the last poll. Renders nothing until there is usage.
 */
export function TerminalSessionUsage({
  sessionId,
  agentSessionId,
  live,
}: {
  sessionId: string | null | undefined;
  agentSessionId: string | null | undefined;
  /** Poll on an interval only while the PTY is live and on screen; otherwise read once. */
  live: boolean;
}) {
  const { t } = useLocale();
  const [usage, setUsage] = useState<AgentSessionUsage | null>(null);

  useEffect(() => setUsage(null), [sessionId, agentSessionId]);

  useEffect(() => {
    if (!sessionId || !agentSessionId || !window.api?.agentSessionUsage) return;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const next = await window.api.agentSessionUsage(sessionId);
        // Keep the last value when a read comes back empty (transcript briefly unavailable).
        if (!cancelled && next) setUsage(next);
      } catch {
        /* keep last value */
      } finally {
        inFlight = false;
      }
    };

    void tick();
    if (!live) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => void tick(), USAGE_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sessionId, agentSessionId, live]);

  if (!usage || usage.totalTokens <= 0) return null;

  const cost =
    usage.costUsd != null
      ? `${usage.costComplete ? "" : "≥"}${formatSessionCost(usage.costUsd)}`
      : null;
  const lines = [
    t("status.usage.title"),
    `${t("status.usage.input")}: ${formatExactTokens(usage.inputTokens)}`,
    `${t("status.usage.output")}: ${formatExactTokens(usage.outputTokens)}`,
    `${t("status.usage.cacheRead")}: ${formatExactTokens(usage.cacheReadTokens)}`,
    `${t("status.usage.cacheWrite")}: ${formatExactTokens(usage.cacheWriteTokens)}`,
    `${t("status.usage.total")}: ${formatExactTokens(usage.totalTokens)}`,
    usage.models.length ? `${t("status.usage.model")}: ${usage.models.join(", ")}` : "",
    cost
      ? `${t("status.usage.cost")}: ${cost}${usage.costComplete ? "" : ` (${t("status.usage.costPartial")})`}`
      : `${t("status.usage.cost")}: ${t("status.usage.costUnknown")}`,
  ];
  const title = `${lines.filter(Boolean).join("\n")}\n\n${t("status.usage.note")}`;

  return (
    <span className="inline-flex items-center gap-1 text-chrome-text-secondary" title={title}>
      <span>
        {formatCompactTokens(usage.totalTokens)} {t("status.usage.tokensUnit")}
      </span>
      {cost ? (
        <>
          <span className="text-chrome-text-dim" aria-hidden>
            ·
          </span>
          <span>{cost}</span>
        </>
      ) : null}
    </span>
  );
}

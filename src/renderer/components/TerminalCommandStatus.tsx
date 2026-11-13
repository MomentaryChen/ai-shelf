import { useCallback, useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";
import { useLocale } from "../i18n/LocaleProvider";
import {
  formatCommandDuration,
  getCommandStatus,
  subscribeCommandStatus,
} from "../terminal/command-marks";

/**
 * Last command's exit code + duration from OSC 133 shell marks.
 * Renders nothing until shell integration reports a finished command
 * (Claude TUI, cmd.exe, shells without integration).
 */
export function TerminalCommandStatus({ sessionId }: { sessionId: string | null | undefined }) {
  const { t } = useLocale();
  const getSnapshot = useCallback(() => getCommandStatus(sessionId), [sessionId]);
  const status = useSyncExternalStore(subscribeCommandStatus, getSnapshot);
  if (!status) return null;

  const { exitCode, durationMs } = status;
  const failed = exitCode !== null && exitCode !== 0;
  const duration = durationMs !== null ? formatCommandDuration(durationMs) : "";
  if (exitCode === null && !duration) return null;
  const title = [
    exitCode === null
      ? t("terminal.marks.status.unknown")
      : failed
        ? t("terminal.marks.status.failed", { code: exitCode })
        : t("terminal.marks.status.ok"),
    duration ? t("terminal.marks.status.duration", { duration }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className="inline-flex items-center gap-1" title={title}>
      {exitCode === null ? null : failed ? (
        <span className="inline-flex items-center gap-0.5 text-fail">
          <X className="h-3 w-3" aria-hidden />
          {exitCode}
        </span>
      ) : (
        <Check className="h-3 w-3 text-ok" aria-hidden />
      )}
      {duration ? <span>{duration}</span> : null}
    </span>
  );
}

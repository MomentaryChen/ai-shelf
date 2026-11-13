import { useCallback, useRef } from "react";
import type { PaneInfo } from "../terminal/split-tree";
import type { ChatSettings } from "../chat-settings";
import type { MessageKey } from "../i18n/messages/en";
import { formatCommandDuration } from "../terminal/command-marks";
import {
  isLongCommand,
  isPaneUnattended,
  NOTIFY_MIN_GAP_MS,
  NotifyRateLimiter,
  paneNotifyDedupe,
  sanitizeNotifyText,
  type TerminalNotifyEvent,
} from "../terminal/terminal-notify";
import { paneDisplayLabel } from "../utils/pane-label";

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

interface Options {
  panes: PaneInfo[];
  focusedPaneId: string | null;
  windowFocused: boolean;
  /** Terminal view is showing (not Inventory / Tools / Tasks). */
  viewActive: boolean;
  settings: ChatSettings;
  t: T;
}

/**
 * Desktop notifications for long commands, BEL and OSC 9 / 777 in panes the
 * user is not looking at. Clicking one focuses the window and the pane
 * (shared pane-agent notification path). Returns the EmbeddedTerminal callback.
 */
export function useTerminalNotifications(opts: Options) {
  const ref = useRef(opts);
  ref.current = opts;
  const limiterRef = useRef<NotifyRateLimiter | null>(null);
  limiterRef.current ??= new NotifyRateLimiter();

  return useCallback((sessionId: string, event: TerminalNotifyEvent) => {
    const { panes, focusedPaneId, windowFocused, viewActive, settings, t } = ref.current;
    if (event.kind === "command" ? !settings.terminalNotifyLongCommand : !settings.terminalNotifyBell) {
      return;
    }
    if (event.kind === "command" && !isLongCommand(event, settings.terminalNotifyLongCommandSec)) {
      return;
    }
    const pane = panes.find((p) => p.sessionId === sessionId);
    if (!pane) return;
    if (!isPaneUnattended(pane.id, { viewActive, windowFocused, focusedPaneId })) return;

    const now = Date.now();
    if (!limiterRef.current!.allow(`${pane.id}:${event.kind}`, NOTIFY_MIN_GAP_MS[event.kind], now)) {
      return;
    }
    if (!paneNotifyDedupe.claim(pane.id, "terminal", now)) return;

    const label = paneDisplayLabel(pane);
    let title: string;
    let body: string;
    switch (event.kind) {
      case "command": {
        const failed = event.exitCode !== null && event.exitCode !== 0;
        title = failed
          ? t("terminal.notify.commandFailedTitle", { pane: label, code: event.exitCode ?? "" })
          : t("terminal.notify.commandDoneTitle", { pane: label });
        const command = sanitizeNotifyText(event.command, 80);
        const duration = event.durationMs !== null ? formatCommandDuration(event.durationMs) : "";
        body = command
          ? t("terminal.notify.commandBody", { command, duration })
          : t("terminal.notify.commandBodyNoText", { duration });
        break;
      }
      case "bell":
        title = t("terminal.notify.bellTitle", { pane: label });
        body = t("terminal.notify.bellBody");
        break;
      case "osc":
        title = event.title ? `${event.title} — ${label}` : label;
        body = event.body;
        break;
    }
    void window.api.showPaneAgentNotification({
      title,
      body,
      paneId: pane.id,
      silent: !settings.paneAgentNotifySound,
    });
  }, []);
}

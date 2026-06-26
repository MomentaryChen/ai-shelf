import { Notification } from "electron";
import type { TrayDeps } from "./tray.js";
import { getTrayAttentionCount, setTrayAttentionCount, showTerminalFromNotification } from "./tray.js";

export interface PaneAgentNotificationPayload {
  title: string;
  body: string;
  paneId?: string;
  silent?: boolean;
}

export function showPaneAgentNotification(
  payload: PaneAgentNotificationPayload,
  deps: TrayDeps,
): { ok: boolean } {
  if (!Notification.isSupported()) return { ok: false };

  const n = new Notification({
    title: payload.title,
    body: payload.body,
    silent: payload.silent === true,
  });

  n.on("click", () => {
    showTerminalFromNotification(deps, payload.paneId);
  });

  n.show();
  return { ok: true };
}

export function syncTrayPaneAttention(count: number, deps: TrayDeps): void {
  setTrayAttentionCount(count, deps);
}

export { getTrayAttentionCount };

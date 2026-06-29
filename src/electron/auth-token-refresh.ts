import { webContents } from "electron";
import {
  getAuthIdToken,
  hydrateAuthSession,
  isIdTokenFresh,
  noteTokenRefreshWaiters,
  resolveTokenRefreshWaiters,
} from "./auth-service.js";

const REFRESH_TIMEOUT_MS = 15_000;

export function broadcastAuthRefreshRequest(): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    wc.send("auth-refresh-token-request");
  }
}

/** Ask a renderer to refresh Firebase ID token, then return the updated main-process token. */
export async function ensureFreshIdToken(): Promise<string | null> {
  hydrateAuthSession();
  if (isIdTokenFresh()) return getAuthIdToken();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(token);
    };

    noteTokenRefreshWaiters(finish);

    const timer = setTimeout(() => {
      resolveTokenRefreshWaiters(getAuthIdToken());
    }, REFRESH_TIMEOUT_MS);

    broadcastAuthRefreshRequest();
  });
}

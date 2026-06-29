import { webContents } from "electron";
import {
  clearTokenRefreshWaiters,
  getAuthIdToken,
  hydrateAuthSession,
  isIdTokenFresh,
  noteTokenRefreshWaiters,
} from "./auth-service.js";

const REFRESH_TIMEOUT_MS = 15_000;

let refreshInFlight: Promise<string | null> | null = null;

export function broadcastAuthRefreshRequest(): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    wc.send("auth-refresh-token-request");
  }
}

function requestTokenRefresh(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      return true;
    };

    const finish = (token: string | null) => {
      if (!settle()) return;
      hydrateAuthSession();
      if (!token) {
        resolve(null);
        return;
      }
      if (isIdTokenFresh()) {
        resolve(token);
      } else {
        reject(new Error("token_refresh_stale"));
      }
    };

    noteTokenRefreshWaiters(finish);

    const timer = setTimeout(() => {
      if (!settle()) return;
      clearTokenRefreshWaiters();
      reject(new Error("token_refresh_timeout"));
    }, REFRESH_TIMEOUT_MS);

    broadcastAuthRefreshRequest();
  });
}

/** Ask a renderer to refresh Firebase ID token, then return the updated main-process token. */
export async function ensureFreshIdToken(): Promise<string | null> {
  hydrateAuthSession();
  if (isIdTokenFresh()) return getAuthIdToken();

  if (!refreshInFlight) {
    refreshInFlight = requestTokenRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

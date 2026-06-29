import { ipcMain, webContents, BrowserWindow } from "electron";
import { join } from "node:path";
import type { AuthSessionReport, AuthStatePublic } from "../shared/auth-types.js";
import {
  applyAuthSessionReport,
  clearAuthSession,
  getAuthStatePublic,
} from "./auth-service.js";
import { ensureFreshIdToken } from "./auth-token-refresh.js";
import { finishGoogleAuthWindow, openGoogleAuthWindow, type GoogleAuthWindowResult } from "./auth-google-window.js";

function broadcastAuthState(state: AuthStatePublic): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    wc.send("auth-state-changed", state);
  }
}

function isSessionReport(value: unknown): value is AuthSessionReport {
  if (!value || typeof value !== "object") return false;
  const report = value as AuthSessionReport;
  if (typeof report.signedIn !== "boolean") return false;
  if (report.signedIn) {
    if (!report.user || typeof report.user.uid !== "string") return false;
  }
  return true;
}

const preloadPath = join(import.meta.dirname, "preload.cjs");

export function registerAuthHandlers(): void {
  ipcMain.handle("auth-report-session", (_event, report: unknown) => {
    if (!isSessionReport(report)) {
      console.warn("[auth] invalid session report");
      return { ok: false as const, error: "Invalid session report" };
    }
    const state = applyAuthSessionReport(report);
    console.info("[auth] session saved", state.signedIn, state.user?.uid ?? "—");
    broadcastAuthState(state);
    return { ok: true as const, state };
  });

  ipcMain.handle("auth-clear-session", () => {
    const state = clearAuthSession();
    broadcastAuthState(state);
    return { ok: true as const, state };
  });

  ipcMain.handle("auth-get-state", (_event, configured: unknown) => {
    const isConfigured = configured === true;
    return getAuthStatePublic(isConfigured);
  });

  ipcMain.handle("auth-get-id-token", async () => {
    const token = await ensureFreshIdToken();
    return { ok: Boolean(token), token: token ?? null };
  });

  ipcMain.handle("auth-open-google-window", (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    return openGoogleAuthWindow(parent, preloadPath);
  });

  ipcMain.handle("auth-finish-google-window", (_event, payload: unknown) => {
    const row = payload as { ok?: boolean; error?: string; state?: AuthStatePublic };
    const result: GoogleAuthWindowResult = {
      ok: row?.ok === true,
      error: row?.error,
      state: row?.state,
    };
    finishGoogleAuthWindow(result);
    if (result.ok) {
      broadcastAuthState(result.state ?? getAuthStatePublic(true));
    }
    return { ok: true as const };
  });
}

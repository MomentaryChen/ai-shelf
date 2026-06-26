import { ipcMain } from "electron";
import type { AuthSessionReport } from "../shared/auth-types.js";
import {
  applyAuthSessionReport,
  clearAuthSession,
  getAuthStatePublic,
} from "./auth-service.js";

function isSessionReport(value: unknown): value is AuthSessionReport {
  if (!value || typeof value !== "object") return false;
  const report = value as AuthSessionReport;
  if (typeof report.signedIn !== "boolean") return false;
  if (report.signedIn) {
    if (!report.user || typeof report.user.uid !== "string") return false;
  }
  return true;
}

export function registerAuthHandlers(): void {
  ipcMain.handle("auth-report-session", (_event, report: unknown) => {
    if (!isSessionReport(report)) {
      return { ok: false as const, error: "Invalid session report" };
    }
    const state = applyAuthSessionReport(report);
    return { ok: true as const, state };
  });

  ipcMain.handle("auth-clear-session", () => {
    const state = clearAuthSession();
    return { ok: true as const, state };
  });

  ipcMain.handle("auth-get-state", (_event, configured: unknown) => {
    const isConfigured = configured === true;
    return getAuthStatePublic(isConfigured);
  });
}

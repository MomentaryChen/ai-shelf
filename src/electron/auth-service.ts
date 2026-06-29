import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AuthSessionReport, AuthStatePublic, AuthUserPublic } from "../shared/auth-types.js";

interface StoredSession {
  user: AuthUserPublic;
  idToken: string | null;
  idTokenExpiresAt: number | null;
}

let session: StoredSession | null = null;
let diskHydrated = false;

function sessionFilePath(): string {
  return join(app.getPath("userData"), "auth-session.json");
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const row = value as StoredSession;
  return Boolean(row.user && typeof row.user.uid === "string");
}

function hydrateFromDisk(): void {
  if (diskHydrated) return;
  diskHydrated = true;
  try {
    const path = sessionFilePath();
    if (!existsSync(path)) return;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isStoredSession(parsed)) {
      session = parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function persistToDisk(next: StoredSession | null): void {
  const path = sessionFilePath();
  if (!next) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next), "utf8");
}

export function applyAuthSessionReport(report: AuthSessionReport): AuthStatePublic {
  hydrateFromDisk();
  if (!report.signedIn || !report.user) {
    session = null;
    persistToDisk(null);
    return { configured: true, signedIn: false, user: null };
  }
  session = {
    user: report.user,
    idToken: report.idToken,
    idTokenExpiresAt: report.idTokenExpiresAt,
  };
  persistToDisk(session);
  return { configured: true, signedIn: true, user: report.user };
}

export function clearAuthSession(): AuthStatePublic {
  hydrateFromDisk();
  session = null;
  persistToDisk(null);
  return { configured: true, signedIn: false, user: null };
}

export function getAuthStatePublic(configured: boolean): AuthStatePublic {
  hydrateFromDisk();
  if (!configured) {
    return { configured: false, signedIn: false, user: null };
  }
  if (!session) {
    return { configured: true, signedIn: false, user: null };
  }
  return { configured: true, signedIn: true, user: session.user };
}

/** For cloud sync — returns a valid ID token when signed in. */
export function getAuthIdToken(): string | null {
  hydrateFromDisk();
  return session?.idToken ?? null;
}

export function getAuthUid(): string | null {
  hydrateFromDisk();
  return session?.user.uid ?? null;
}

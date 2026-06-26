import type { AuthSessionReport, AuthStatePublic, AuthUserPublic } from "../shared/auth-types.js";

interface StoredSession {
  user: AuthUserPublic;
  idToken: string | null;
  idTokenExpiresAt: number | null;
}

let session: StoredSession | null = null;

export function applyAuthSessionReport(report: AuthSessionReport): AuthStatePublic {
  if (!report.signedIn || !report.user) {
    session = null;
    return { configured: true, signedIn: false, user: null };
  }
  session = {
    user: report.user,
    idToken: report.idToken,
    idTokenExpiresAt: report.idTokenExpiresAt,
  };
  return { configured: true, signedIn: true, user: report.user };
}

export function clearAuthSession(): AuthStatePublic {
  session = null;
  return { configured: true, signedIn: false, user: null };
}

export function getAuthStatePublic(configured: boolean): AuthStatePublic {
  if (!configured) {
    return { configured: false, signedIn: false, user: null };
  }
  if (!session) {
    return { configured: true, signedIn: false, user: null };
  }
  return { configured: true, signedIn: true, user: session.user };
}

/** For future cloud sync — returns a valid ID token when signed in. */
export function getAuthIdToken(): string | null {
  return session?.idToken ?? null;
}

export function getAuthUid(): string | null {
  return session?.user.uid ?? null;
}

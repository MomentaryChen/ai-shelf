import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  getRedirectResult,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { initializeApp, type FirebaseApp } from "firebase/app";
import type { AuthSessionReport, AuthUserPublic } from "../../shared/auth-types.js";
import { parseAuthError, type AuthErrorReason } from "./auth-errors.js";
import { getFirebaseConfig, isFirebaseConfigured } from "./config.js";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let initFailed = false;

function getApp(): FirebaseApp | null {
  if (initFailed) return null;
  const config = getFirebaseConfig();
  if (!config) return null;
  if (!app) {
    try {
      app = initializeApp(config);
    } catch {
      initFailed = true;
      return null;
    }
  }
  return app;
}

export function getFirebaseApp(): FirebaseApp | null {
  return getApp();
}

function getFirebaseAuth(): Auth | null {
  const firebaseApp = getApp();
  if (!firebaseApp) return null;
  if (auth) return auth;
  // initializeAuth + browserPopupRedirectResolver often yields auth/internal-error in Electron.
  auth = getAuth(firebaseApp);
  return auth;
}

export { isFirebaseConfigured, getFirebaseAuth };
export { probeFirebaseAuthSetup } from "./auth-probe.js";
export { parseAuthError, type AuthErrorReason } from "./auth-errors.js";

const AUTH_RETURN_HASH_KEY = "firebaseAuthReturnHash";
const AUTH_REDIRECT_PENDING_KEY = "firebaseAuthRedirectPending";

export function saveAuthReturnHash(): void {
  const hash =
    window.location.hash && window.location.hash.length > 1 ? window.location.hash : "#settings";
  sessionStorage.setItem(AUTH_RETURN_HASH_KEY, hash);
}

export function beginGoogleRedirect(): void {
  saveAuthReturnHash();
  sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, "1");
}

export function isReturningFromGoogleRedirect(): boolean {
  if (window.location.pathname.includes("/__/auth/")) return true;
  if (window.location.hash.includes("__/auth/")) return true;
  if (window.location.hash.includes("access_token") || window.location.hash.includes("id_token")) {
    return true;
  }
  return sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) === "1";
}

export function clearGoogleRedirectPending(): void {
  sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
}

export function restoreAuthReturnHash(): void {
  const saved = sessionStorage.getItem(AUTH_RETURN_HASH_KEY);
  if (!saved) return;
  sessionStorage.removeItem(AUTH_RETURN_HASH_KEY);
  const target = saved.startsWith("#") ? saved : `#${saved}`;
  if (window.location.hash !== target) {
    window.location.hash = target.slice(1);
  }
}

let redirectInFlight: Promise<{
  error?: string;
  reason?: string;
  user?: User;
}> | null = null;

export function isElectronRenderer(): boolean {
  return typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
}

function isAuthGoogleWindow(): boolean {
  const route = window.location.hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  return route === "auth-google" || route.startsWith("__/auth/");
}

function parseOAuthTokens(url: string): { idToken?: string; accessToken?: string } {
  try {
    const parsed = new URL(url);
    const fromHash = new URLSearchParams(
      parsed.hash.startsWith("#") ? parsed.hash.slice(1).replace(/^\/?/, "") : parsed.hash,
    );
    const fromSearch = parsed.searchParams;
    const idToken = fromHash.get("id_token") ?? fromSearch.get("id_token") ?? undefined;
    const accessToken = fromHash.get("access_token") ?? fromSearch.get("access_token") ?? undefined;
    return { idToken, accessToken };
  } catch {
    return {};
  }
}

/** Fallback when getRedirectResult fails in Electron — tokens may be in the callback URL. */
export async function trySignInFromOAuthUrl(url?: string): Promise<User | null> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return null;

  const target = url ?? window.location.href;
  const { idToken, accessToken } = parseOAuthTokens(target);
  if (!idToken && !accessToken) return null;

  try {
    const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken);
    const result = await signInWithCredential(firebaseAuth, credential);
    clearGoogleRedirectPending();
    restoreAuthReturnHash();
    return result.user;
  } catch {
    return null;
  }
}

function toPublicUser(user: User): AuthUserPublic {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export async function buildSessionReport(
  user: User | null,
  opts?: { forceRefresh?: boolean },
): Promise<AuthSessionReport> {
  if (!user) {
    return { signedIn: false, user: null, idToken: null, idTokenExpiresAt: null };
  }
  const idToken = await user.getIdToken(opts?.forceRefresh === true);
  const tokenResult = await user.getIdTokenResult();
  return {
    signedIn: true,
    user: toPublicUser(user),
    idToken,
    idTokenExpiresAt: tokenResult.expirationTime ? Date.parse(tokenResult.expirationTime) : null,
  };
}

export async function completeGoogleRedirectSignIn(): Promise<{
  error?: string;
  reason?: string;
  user?: User;
}> {
  if (!redirectInFlight) {
    redirectInFlight = finishGoogleRedirectSignIn().finally(() => {
      redirectInFlight = null;
    });
  }
  return redirectInFlight;
}

async function finishGoogleRedirectSignIn(): Promise<{
  error?: string;
  reason?: string;
  user?: User;
}> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return {};

  const fromUrl = await trySignInFromOAuthUrl(window.location.href);
  if (fromUrl) return { user: fromUrl };

  try {
    const credential = await getRedirectResult(firebaseAuth);
    restoreAuthReturnHash();
    const user = credential?.user ?? firebaseAuth.currentUser;
    if (user) clearGoogleRedirectPending();
    return user ? { user } : {};
  } catch (err) {
    restoreAuthReturnHash();

    const fromUrlAfter = await trySignInFromOAuthUrl(window.location.href);
    if (fromUrlAfter) return { user: fromUrlAfter };

    const user = firebaseAuth.currentUser ?? (await waitForSignedInUser(5000));
    if (user) {
      clearGoogleRedirectPending();
      return { user };
    }

    const parsed = parseAuthError(err);
    if (parsed.reason === "internal-error") {
      return { error: parsed.raw, reason: "internal-error" };
    }
    return { error: parsed.raw, reason: parsed.reason };
  }
}

export async function completeAuthFromNavigationUrl(url: string): Promise<User | null> {
  const fromUrl = await trySignInFromOAuthUrl(url);
  if (fromUrl) return fromUrl;

  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return null;

  try {
    const credential = await getRedirectResult(firebaseAuth);
    return credential?.user ?? firebaseAuth.currentUser;
  } catch {
    return firebaseAuth.currentUser ?? (await waitForSignedInUser(3000));
  }
}

export async function signInWithGoogle(): Promise<
  | { ok: true; redirecting?: boolean; user?: User }
  | { ok: false; error: string; reason?: AuthErrorReason }
> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return { ok: false, error: "not_configured", reason: "not_configured" };
  try {
    const provider = new GoogleAuthProvider();

    if (isElectronRenderer() && isAuthGoogleWindow()) {
      try {
        const credential = await signInWithPopup(firebaseAuth, provider);
        return { ok: true, redirecting: false, user: credential.user };
      } catch (popupErr) {
        if (firebaseAuth.currentUser) {
          return { ok: true, redirecting: false, user: firebaseAuth.currentUser };
        }
        beginGoogleRedirect();
        await signInWithRedirect(firebaseAuth, provider);
        return { ok: true, redirecting: true };
      }
    }

    if (isElectronRenderer()) {
      try {
        await signInWithPopup(firebaseAuth, provider);
        return { ok: true, redirecting: false, user: firebaseAuth.currentUser ?? undefined };
      } catch {
        if (firebaseAuth.currentUser) {
          return { ok: true, redirecting: false, user: firebaseAuth.currentUser };
        }
        beginGoogleRedirect();
        await signInWithRedirect(firebaseAuth, provider);
        return { ok: true, redirecting: true };
      }
    }

    beginGoogleRedirect();
    await signInWithRedirect(firebaseAuth, provider);
    return { ok: true, redirecting: true };
  } catch (err) {
    if (firebaseAuth.currentUser) {
      return { ok: true, redirecting: false, user: firebaseAuth.currentUser };
    }
    const parsed = parseAuthError(err);
    return { ok: false, error: parsed.raw, reason: parsed.reason };
  }
}

export async function signOutGoogle(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (firebaseAuth) await signOut(firebaseAuth);
}

export function subscribeAuthState(cb: (user: User | null) => void): () => void {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth, cb);
}

export function waitForAuthPersistence(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(firebaseAuth, () => {
      unsub();
      resolve();
    });
  });
}

export async function waitForAuthReady(): Promise<User | null> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return null;
  await waitForAuthPersistence();
  return firebaseAuth.currentUser;
}

export function waitForSignedInUser(timeoutMs = 8000): Promise<User | null> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return Promise.resolve(null);
  if (firebaseAuth.currentUser) return Promise.resolve(firebaseAuth.currentUser);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(firebaseAuth.currentUser);
    }, timeoutMs);
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user) return;
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

export function shouldHandleAuthRedirectOnLoad(): boolean {
  if (!isFirebaseConfigured()) return false;
  return isReturningFromGoogleRedirect();
}

/** Ensure Firestore requests carry a Firebase user (Electron may only have main-process session). */
export async function ensureFirebaseAuthForSync(): Promise<User | null> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return null;

  if (firebaseAuth.currentUser) {
    try {
      await firebaseAuth.currentUser.getIdToken(true);
    } catch {
      /* continue with cached user */
    }
    return firebaseAuth.currentUser;
  }

  if (isElectronRenderer()) {
    const mainState = await window.api.authGetState(true);
    if (!mainState.signedIn) return null;

    const tokenResult = await window.api.authGetIdToken();
    const idToken = tokenResult.ok ? tokenResult.token : null;
    if (idToken) {
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(firebaseAuth, credential);
        return result.user;
      } catch {
        /* fall through */
      }
    }

    return waitForSignedInUser(8000);
  }

  return waitForAuthReady();
}

/** Refresh Firebase ID token and push an updated session report to the main process. */
export async function refreshAuthSessionForMain(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  const firebaseAuth = getFirebaseAuth();
  let user = firebaseAuth?.currentUser ?? null;
  if (!user) {
    user = await ensureFirebaseAuthForSync();
  }
  if (!user) return false;

  const report = await buildSessionReport(user, { forceRefresh: true });
  const result = await window.api.authReportSession(report);
  return result.ok;
}

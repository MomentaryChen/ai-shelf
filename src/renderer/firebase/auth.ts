import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import type { AuthSessionReport, AuthUserPublic } from "../../shared/auth-types.js";
import { getFirebaseConfig, isFirebaseConfigured } from "./config.js";

let app: FirebaseApp | null = null;
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

export function getFirebaseAuth() {
  const firebaseApp = getApp();
  return firebaseApp ? getAuth(firebaseApp) : null;
}

export { isFirebaseConfigured };

function toPublicUser(user: User): AuthUserPublic {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export async function buildSessionReport(user: User | null): Promise<AuthSessionReport> {
  if (!user) {
    return { signedIn: false, user: null, idToken: null, idTokenExpiresAt: null };
  }
  const idToken = await user.getIdToken();
  const tokenResult = await user.getIdTokenResult();
  return {
    signedIn: true,
    user: toPublicUser(user),
    idToken,
    idTokenExpiresAt: tokenResult.expirationTime ? Date.parse(tokenResult.expirationTime) : null,
  };
}

export async function signInWithGoogle(): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = getFirebaseAuth();
  if (!auth) return { ok: false, error: "not_configured" };
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function signOutGoogle(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
}

export function subscribeAuthState(cb: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

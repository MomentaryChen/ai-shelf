import { isFirebaseConfigured } from "./firebase/config.js";
import {
  CONFIGURED_SIGNED_OUT_STATE,
  NOT_CONFIGURED_STATE,
  setAuthSessionSnapshot,
} from "./auth-session-store.js";
import type { AuthStatePublic } from "../shared/auth-types.js";

let started = false;

async function readMainAuthState(): Promise<AuthStatePublic> {
  if (!isFirebaseConfigured()) return NOT_CONFIGURED_STATE;
  return window.api.authGetState(true);
}

/** Attach main-process auth listeners once per renderer (before React mounts). */
export function ensureAuthSessionSync(): void {
  if (started || !isFirebaseConfigured()) return;
  started = true;

  void readMainAuthState().then(setAuthSessionSnapshot);

  window.api.onAuthStateChanged((state) => {
    setAuthSessionSnapshot(state);
  });
}

export function resetAuthSessionSyncForTests(): void {
  started = false;
  setAuthSessionSnapshot(
    isFirebaseConfigured() ? CONFIGURED_SIGNED_OUT_STATE : NOT_CONFIGURED_STATE,
  );
}

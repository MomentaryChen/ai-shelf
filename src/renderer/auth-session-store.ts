import type { AuthStatePublic } from "../shared/auth-types.js";
import { isFirebaseConfigured } from "./firebase/config.js";

type Listener = (state: AuthStatePublic) => void;

export const NOT_CONFIGURED_STATE: AuthStatePublic = {
  configured: false,
  signedIn: false,
  user: null,
};

export const CONFIGURED_SIGNED_OUT_STATE: AuthStatePublic = {
  configured: true,
  signedIn: false,
  user: null,
};

function defaultAuthState(): AuthStatePublic {
  return isFirebaseConfigured() ? CONFIGURED_SIGNED_OUT_STATE : NOT_CONFIGURED_STATE;
}

const listeners = new Set<Listener>();
let snapshot: AuthStatePublic = defaultAuthState();

export function getAuthSessionSnapshot(): AuthStatePublic {
  return snapshot;
}

export function setAuthSessionSnapshot(state: AuthStatePublic): void {
  snapshot = state;
  for (const listener of listeners) {
    listener(state);
  }
}

export function subscribeAuthSessionSnapshot(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

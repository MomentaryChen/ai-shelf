import { useAuthSessionBridge } from "./hooks/useAuthSession";

/** Syncs Firebase auth with the main process (mount once per window). */
export function AuthBridge() {
  useAuthSessionBridge();
  return null;
}

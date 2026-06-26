import { useAuthSessionBridge } from "./hooks/useAuthSession";
import { useCloudSyncOnSignIn } from "./hooks/useCloudSync";

/** Syncs Firebase auth + cloud sync with the main process (mount once per window). */
export function AuthBridge() {
  useAuthSessionBridge();
  useCloudSyncOnSignIn();
  return null;
}

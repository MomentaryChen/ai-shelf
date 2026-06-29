import { planSyncAction } from "../shared/sync-compare.js";
import type { CloudSyncCompareState } from "../shared/sync-types.js";
import {
  ensureFirebaseAuthForSync,
  isElectronRenderer,
  isFirebaseConfigured,
} from "./firebase/auth.js";
import { pullRemoteSyncState } from "./firebase/sync-remote.js";
import { getSyncStatus, setSyncStatus } from "./sync-status-store.js";

async function resolveSyncUid(): Promise<string | null> {
  if (isElectronRenderer()) {
    const auth = await window.api.authGetState(true);
    return auth.signedIn && auth.user ? auth.user.uid : null;
  }
  const user = await ensureFirebaseAuthForSync();
  return user?.uid ?? null;
}

/** Pull remote state and update compare icons without writing local or cloud data. */
export async function refreshCloudSyncStatus(): Promise<CloudSyncCompareState> {
  if (!isFirebaseConfigured()) {
    setSyncStatus({ compareState: "unknown", compareCheckedAt: null });
    return "unknown";
  }

  const uid = await resolveSyncUid();
  if (!uid) {
    setSyncStatus({ compareState: "unknown", compareCheckedAt: null });
    return "unknown";
  }

  if (getSyncStatus().syncing) {
    return getSyncStatus().compareState;
  }

  setSyncStatus({ compareState: "checking" });
  try {
    const exported = await window.api.syncExportLocal();
    if (!exported.ok) {
      throw new Error("Failed to export local data");
    }

    const remoteState = await pullRemoteSyncState(uid);
    const plan = planSyncAction(exported.bundle, remoteState?.bundle ?? null);
    const checkedAt = new Date().toISOString();
    setSyncStatus({ compareState: plan.compareState, compareCheckedAt: checkedAt });
    return plan.compareState;
  } catch {
    setSyncStatus({ compareState: "unknown", compareCheckedAt: null });
    return "unknown";
  }
}

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { SyncStatus } from "../../shared/sync-types.js";
import { getFirebaseAuth, isFirebaseConfigured } from "../firebase/auth.js";
import { mergeSyncBundles } from "../firebase/sync-merge.js";
import { pullRemoteSyncState, pushRemoteSyncState } from "../firebase/sync-remote.js";

async function loadMeta(): Promise<Pick<SyncStatus, "lastSyncAt" | "lastError">> {
  return window.api.syncGetMeta();
}

export function useCloudSync() {
  const [status, setStatus] = useState<SyncStatus>({
    lastSyncAt: null,
    lastError: null,
    syncing: false,
  });

  useEffect(() => {
    void loadMeta().then((meta) => {
      setStatus((s) => ({ ...s, ...meta }));
    });
  }, []);

  const runSync = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!isFirebaseConfigured()) {
      return { ok: false, error: "not_configured" };
    }
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user) {
      return { ok: false, error: "not_signed_in" };
    }

    setStatus((s) => ({ ...s, syncing: true, lastError: null }));
    try {
      const exported = await window.api.syncExportLocal();
      if (!exported.ok) {
        throw new Error("Failed to export local data");
      }
      const local = exported.bundle;

      const remoteState = await pullRemoteSyncState(user.uid);
      const merged = remoteState ? mergeSyncBundles(local, remoteState.bundle) : local;

      const applied = await window.api.syncApplyBundle(merged);
      if (!applied.ok) {
        throw new Error(applied.error ?? "Failed to apply sync bundle");
      }

      const nextRevision = (remoteState?.revision ?? 0) + 1;
      const refreshed = await window.api.syncExportLocal();
      const toPush = refreshed.ok ? refreshed.bundle : merged;
      await pushRemoteSyncState(user.uid, toPush, nextRevision);

      const now = new Date().toISOString();
      await window.api.syncSetMeta({ lastSyncAt: now, lastError: null });
      setStatus({ lastSyncAt: now, lastError: null, syncing: false });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await window.api.syncSetMeta({ lastError: message });
      setStatus((s) => ({ ...s, syncing: false, lastError: message }));
      return { ok: false, error: message };
    }
  }, []);

  return { status, runSync };
}

/** Pull and push once after the user signs in. */
export function useCloudSyncOnSignIn(): void {
  const { runSync } = useCloudSync();
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;
  const syncedUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = getFirebaseAuth();
    if (!auth) return;

    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        syncedUidRef.current = null;
        return;
      }
      if (syncedUidRef.current === user.uid) return;
      syncedUidRef.current = user.uid;
      void runSyncRef.current();
    });
  }, []);
}

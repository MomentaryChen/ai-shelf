import { useCallback, useEffect, useState } from "react";
import type { SyncConflictPreference, SyncStatus } from "../../shared/sync-types.js";
import { refreshCloudSyncStatus } from "../cloud-sync-status.js";
import { runCloudSync } from "../cloud-sync-runner.js";
import { setSyncStatus, subscribeSyncStatus } from "../sync-status-store.js";
import { useAuthSession } from "./useAuthSession.js";

async function loadMeta(): Promise<Pick<SyncStatus, "lastSyncAt" | "lastError" | "syncDay" | "syncCountToday">> {
  return window.api.syncGetMeta();
}

export function useCloudSync() {
  const { state: authState } = useAuthSession();
  const [status, setStatus] = useState<SyncStatus>(() => ({
    lastSyncAt: null,
    lastError: null,
    syncDay: null,
    syncCountToday: 0,
    syncing: false,
    compareState: "unknown",
    compareCheckedAt: null,
  }));

  useEffect(() => subscribeSyncStatus(setStatus), []);

  useEffect(() => {
    void loadMeta().then((meta) => {
      setSyncStatus({ ...meta, syncing: false });
    });
  }, []);

  useEffect(() => {
    if (!authState.signedIn) {
      setSyncStatus({ compareState: "unknown", compareCheckedAt: null });
      return;
    }
    void refreshCloudSyncStatus();
  }, [authState.signedIn, authState.user?.uid]);

  const runSync = useCallback(
    async (
      prefer: SyncConflictPreference = "local",
    ): Promise<{ ok: boolean; error?: string; skipped?: boolean }> => {
      return runCloudSync({ prefer });
    },
    [],
  );

  const refreshCompare = useCallback(async () => {
    return refreshCloudSyncStatus();
  }, []);

  return { status, runSync, refreshCompare };
}

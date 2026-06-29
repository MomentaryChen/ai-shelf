import { useCallback, useEffect, useState } from "react";
import type { SyncStatus } from "../../shared/sync-types.js";
import { runCloudSync } from "../cloud-sync-runner.js";
import { setSyncStatus, subscribeSyncStatus } from "../sync-status-store.js";

async function loadMeta(): Promise<Pick<SyncStatus, "lastSyncAt" | "lastError" | "syncDay" | "syncCountToday">> {
  return window.api.syncGetMeta();
}

export function useCloudSync() {
  const [status, setStatus] = useState<SyncStatus>(() => ({
    lastSyncAt: null,
    lastError: null,
    syncDay: null,
    syncCountToday: 0,
    syncing: false,
  }));

  useEffect(() => subscribeSyncStatus(setStatus), []);

  useEffect(() => {
    void loadMeta().then((meta) => {
      setSyncStatus({ ...meta, syncing: false });
    });
  }, []);

  const runSync = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    return runCloudSync();
  }, []);

  return { status, runSync };
}

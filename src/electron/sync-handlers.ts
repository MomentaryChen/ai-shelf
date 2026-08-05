import { BrowserWindow, ipcMain } from "electron";
import type { CloudSyncStateDoc, SyncBundle, SyncMeta } from "../shared/sync-types.js";
import { getAuthStatePublic } from "./auth-service.js";
import { pullRemoteSyncStateMain, pushRemoteSyncStateMain } from "./firestore-sync.js";
import { applySyncBundle } from "./sync-apply.js";
import { getSyncDeviceId } from "./sync-device.js";
import { exportLocalSyncBundle } from "./sync-export.js";
import { readSyncMeta, writeSyncMeta } from "./sync-meta-store.js";

function broadcastSyncApplied(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("sync-data-applied");
    }
  }
}

export function registerSyncHandlers(): void {
  ipcMain.handle("sync-export-local", () => {
    const deviceId = getSyncDeviceId();
    const bundle = exportLocalSyncBundle(deviceId);
    return { ok: true as const, bundle };
  });

  ipcMain.handle("sync-apply-bundle", (_event, bundle: unknown, options?: unknown) => {
    const replace =
      options != null &&
      typeof options === "object" &&
      (options as { replace?: unknown }).replace === true;
    const result = applySyncBundle(bundle, { replace });
    if (result.ok) broadcastSyncApplied();
    return result;
  });

  ipcMain.handle("sync-get-meta", () => readSyncMeta());

  ipcMain.handle("sync-set-meta", (_event, partial: unknown) => {
    if (!partial || typeof partial !== "object") {
      return { ok: false as const, error: "Invalid meta" };
    }
    const meta = writeSyncMeta(partial as Partial<SyncMeta>);
    return { ok: true as const, meta };
  });

  ipcMain.handle("sync-pull-remote", async () => {
    try {
      const auth = getAuthStatePublic(true);
      if (!auth.signedIn || !auth.user) {
        return { ok: false as const, error: "not_signed_in" };
      }
      const state = await pullRemoteSyncStateMain(auth.user.uid);
      return { ok: true as const, state: state as CloudSyncStateDoc | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

  ipcMain.handle("sync-push-remote", async (_event, payload: unknown) => {
    try {
      const row = payload as { bundle?: SyncBundle; revision?: number };
      const auth = getAuthStatePublic(true);
      if (!auth.signedIn || !auth.user) {
        return { ok: false as const, error: "not_signed_in" };
      }
      if (!row?.bundle || typeof row.revision !== "number") {
        return { ok: false as const, error: "Invalid sync payload" };
      }
      await pushRemoteSyncStateMain(auth.user.uid, row.bundle, row.revision);
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });
}

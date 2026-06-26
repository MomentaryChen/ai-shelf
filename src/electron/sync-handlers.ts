import { BrowserWindow, ipcMain } from "electron";
import type { SyncMeta } from "../shared/sync-types.js";
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

  ipcMain.handle("sync-apply-bundle", (_event, bundle: unknown) => {
    const result = applySyncBundle(bundle);
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
}

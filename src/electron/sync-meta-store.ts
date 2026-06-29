import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SyncMeta } from "../shared/sync-types.js";

const FILE = "sync-meta.json";

const DEFAULT_META: SyncMeta = {
  lastSyncAt: null,
  lastError: null,
  syncDay: null,
  syncCountToday: 0,
};

function metaPath(): string {
  return join(app.getPath("userData"), FILE);
}

export function readSyncMeta(): SyncMeta {
  const path = metaPath();
  if (!existsSync(path)) return { ...DEFAULT_META };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<SyncMeta>;
    return {
      lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      syncDay: typeof parsed.syncDay === "string" ? parsed.syncDay : null,
      syncCountToday: typeof parsed.syncCountToday === "number" ? parsed.syncCountToday : 0,
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function writeSyncMeta(partial: Partial<SyncMeta>): SyncMeta {
  const next = { ...readSyncMeta(), ...partial };
  const path = metaPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

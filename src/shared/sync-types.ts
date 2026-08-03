import type { GroupLayoutSnapshot } from "ai-shelf";

export const SYNC_BUNDLE_VERSION = 1;

export interface SyncProfileGroup {
  id: string;
  name: string;
  rootPath: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SyncProfile {
  id: string;
  workspaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SyncLayout {
  profileId: string;
  workspaceId: string;
  snapshot: GroupLayoutSnapshot;
  deletedAt?: string | null;
}

export interface SyncPreferences {
  lastActiveGroupKey: string | null;
  /** Optional for older sync bundles; profile group id → last profile id. */
  lastActiveByGroup?: Record<string, string> | null;
  updatedAt: string;
}

export interface SyncBundle {
  version: typeof SYNC_BUNDLE_VERSION;
  exportedAt: string;
  deviceId: string;
  profileGroups: SyncProfileGroup[];
  profiles: SyncProfile[];
  layouts: SyncLayout[];
  preferences: SyncPreferences | null;
}

export interface SyncMeta {
  lastSyncAt: string | null;
  lastError: string | null;
  /** UTC date (YYYY-MM-DD) for daily sync op counting. */
  syncDay: string | null;
  syncCountToday: number;
}

export interface CloudSyncStateDoc {
  version: typeof SYNC_BUNDLE_VERSION;
  /** Monotonic counter for bookkeeping; push does not compare-and-swap on this value. */
  revision: number;
  updatedAt: string;
  bundle: SyncBundle;
}

/** Global registry: `_meta/sync-registry` in Firestore. */
export interface SyncUserRegistryDoc {
  count: number;
  /** uid → registeredAt (ISO) */
  users: Record<string, string>;
}

export type CloudSyncCompareState =
  | "unknown"
  | "checking"
  | "in_sync"
  | "local_ahead"
  | "remote_ahead"
  | "diverged";

/**
 * Manual sync conflict preference.
 * - `local`: push this device’s bundle (overwrite cloud)
 * - `cloud`: apply the remote bundle (overwrite local)
 * - `merge`: per-item last-write-wins (used for silent sync / compare)
 */
export type SyncConflictPreference = "local" | "cloud" | "merge";

export interface SyncStatus extends SyncMeta {
  syncing: boolean;
  compareState: CloudSyncCompareState;
  compareCheckedAt: string | null;
}

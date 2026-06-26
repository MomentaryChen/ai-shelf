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
}

export interface CloudSyncStateDoc {
  version: typeof SYNC_BUNDLE_VERSION;
  revision: number;
  updatedAt: string;
  bundle: SyncBundle;
}

export interface SyncStatus extends SyncMeta {
  syncing: boolean;
}

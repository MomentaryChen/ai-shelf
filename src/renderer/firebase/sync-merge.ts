import type { SyncBundle, SyncProfile, SyncProfileGroup, SyncLayout, SyncPreferences } from "../../shared/sync-types.js";

function pickNewer<T extends { id?: string; profileId?: string; updatedAt?: string; snapshot?: { updatedAt: string } }>(
  localItems: T[],
  remoteItems: T[],
  getUpdatedAt: (item: T) => string,
  getKey: (item: T) => string,
): T[] {
  const map = new Map<string, T>();
  for (const item of localItems) {
    map.set(getKey(item), item);
  }
  for (const remote of remoteItems) {
    const key = getKey(remote);
    const local = map.get(key);
    if (!local) {
      map.set(key, remote);
      continue;
    }
    if (getUpdatedAt(remote) >= getUpdatedAt(local)) {
      map.set(key, remote);
    }
  }
  return [...map.values()];
}

export function mergeSyncBundles(local: SyncBundle, remote: SyncBundle): SyncBundle {
  const profileGroups = pickNewer(
    local.profileGroups,
    remote.profileGroups,
    (g) => g.updatedAt,
    (g) => g.id,
  ) as SyncProfileGroup[];

  const profiles = pickNewer(
    local.profiles,
    remote.profiles,
    (p) => p.updatedAt,
    (p) => p.id,
  ) as SyncProfile[];

  const layouts = pickNewer(
    local.layouts,
    remote.layouts,
    (l) => l.snapshot.updatedAt,
    (l) => l.profileId,
  ) as SyncLayout[];

  let preferences: SyncPreferences | null = local.preferences;
  if (remote.preferences && local.preferences) {
    preferences =
      remote.preferences.updatedAt >= local.preferences.updatedAt
        ? remote.preferences
        : local.preferences;
  } else {
    preferences = remote.preferences ?? local.preferences;
  }

  return {
    version: local.version,
    exportedAt: new Date().toISOString(),
    deviceId: local.deviceId,
    profileGroups,
    profiles,
    layouts,
    preferences,
  };
}

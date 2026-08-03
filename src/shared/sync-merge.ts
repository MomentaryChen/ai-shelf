import type {
  SyncBundle,
  SyncLayout,
  SyncPreferences,
  SyncProfile,
  SyncProfileGroup,
} from "./sync-types.js";

/** Per-item merge by updatedAt; whole-bundle push is still last-write-wins (no revision CAS). */
function pickNewer<
  T extends {
    id?: string;
    profileId?: string;
    updatedAt?: string;
    snapshot?: { updatedAt: string };
  },
>(
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

function sameLastActiveByGroup(
  a: Record<string, string> | null | undefined,
  b: Record<string, string> | null | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((k) => left[k] === right[k]);
}

function mergePreferences(
  local: SyncPreferences | null,
  remote: SyncPreferences | null,
): SyncPreferences | null {
  if (!local && !remote) return null;
  if (!local) return remote;
  if (!remote) return local;
  if (
    local.lastActiveGroupKey === remote.lastActiveGroupKey &&
    sameLastActiveByGroup(local.lastActiveByGroup, remote.lastActiveByGroup)
  ) {
    return local;
  }
  return remote.updatedAt >= local.updatedAt ? remote : local;
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

  const preferences = mergePreferences(local.preferences, remote.preferences);

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

import { mergeSyncBundles } from "./sync-merge.js";
import type {
  CloudSyncCompareState,
  SyncBundle,
  SyncLayout,
  SyncProfile,
  SyncProfileGroup,
} from "./sync-types.js";

export type SyncCompareAction = "noop" | "apply_only" | "push_only" | "apply_and_push";

export interface SyncComparePlan {
  action: SyncCompareAction;
  merged: SyncBundle;
  compareState: CloudSyncCompareState;
}

type NormalizedPreferences = { lastActiveGroupKey: string | null } | null;

interface NormalizedBundle {
  version: number;
  profileGroups: Omit<SyncProfileGroup, "rootPath">[];
  profiles: SyncProfile[];
  layouts: SyncLayout[];
  preferences: NormalizedPreferences;
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function sortLayouts(items: SyncLayout[]): SyncLayout[] {
  return [...items].sort((a, b) => a.profileId.localeCompare(b.profileId));
}

function normalizeProfileGroup(group: SyncProfileGroup): Omit<SyncProfileGroup, "rootPath"> {
  const { rootPath: _rootPath, ...rest } = group;
  return rest;
}

function normalizeBundle(bundle: SyncBundle): NormalizedBundle {
  return {
    version: bundle.version,
    profileGroups: sortById(bundle.profileGroups.map(normalizeProfileGroup)),
    profiles: sortById(bundle.profiles),
    layouts: sortLayouts(bundle.layouts),
    preferences: bundle.preferences
      ? { lastActiveGroupKey: bundle.preferences.lastActiveGroupKey }
      : null,
  };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function bundlesNormalizedEqual(a: SyncBundle, b: SyncBundle): boolean {
  return stableStringify(normalizeBundle(a)) === stableStringify(normalizeBundle(b));
}

export function planSyncAction(local: SyncBundle, remote: SyncBundle | null): SyncComparePlan {
  if (!remote) {
    return { action: "push_only", merged: local, compareState: "local_ahead" };
  }

  const merged = mergeSyncBundles(local, remote);
  const localEqRemote = bundlesNormalizedEqual(local, remote);

  if (localEqRemote) {
    return { action: "noop", merged, compareState: "in_sync" };
  }

  const localEqMerged = bundlesNormalizedEqual(local, merged);
  const remoteEqMerged = bundlesNormalizedEqual(remote, merged);

  if (localEqMerged && !remoteEqMerged) {
    return { action: "push_only", merged, compareState: "local_ahead" };
  }
  if (remoteEqMerged && !localEqMerged) {
    return { action: "apply_only", merged, compareState: "remote_ahead" };
  }

  return { action: "apply_and_push", merged, compareState: "diverged" };
}

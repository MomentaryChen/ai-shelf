import type { SerializedLayoutNode } from "./layout-serialize";

export const GROUP_LAYOUTS_KEY = "ai-inventory-group-layouts";
export const LAST_ACTIVE_GROUP_KEY = "ai-inventory-last-active-group";

export const MAX_GROUP_PANES = 8;

export interface GroupLayoutSnapshot {
  defaultCwd: string;
  defaultTool?: string;
  panes: { tool: string; cwd: string; title?: string }[];
  layout: SerializedLayoutNode | null;
  broadcastInput?: boolean;
  accentColor?: string | null;
  updatedAt: string;
}

export function groupKey(workspaceId: string, groupId: string): string {
  return `${workspaceId}:${groupId}`;
}

export function parseGroupKey(key: string): { workspaceId: string; groupId: string } | null {
  const i = key.indexOf(":");
  if (i <= 0) return null;
  return { workspaceId: key.slice(0, i), groupId: key.slice(i + 1) };
}

export async function loadGroupSnapshot(
  workspaceId: string,
  groupId: string,
): Promise<GroupLayoutSnapshot | null> {
  const r = await window.api.wsGroupLayoutGet(workspaceId, groupId);
  if (!r.success || !r.snapshot) return null;
  return r.snapshot as GroupLayoutSnapshot;
}

export async function saveGroupSnapshot(
  workspaceId: string,
  groupId: string,
  snapshot: GroupLayoutSnapshot,
): Promise<void> {
  await window.api.wsGroupLayoutSave(workspaceId, groupId, snapshot);
  // Backward-compatibility: keep writing legacy localStorage snapshot map for older builds.
  try {
    const key = groupKey(workspaceId, groupId);
    const raw = localStorage.getItem(GROUP_LAYOUTS_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, GroupLayoutSnapshot>) : {};
    all[key] = snapshot;
    localStorage.setItem(GROUP_LAYOUTS_KEY, JSON.stringify(all));
  } catch {
    /* best-effort legacy mirror */
  }
}

export async function saveLastActiveGroupKey(workspaceId: string, groupId: string): Promise<void> {
  await window.api.wsGroupLayoutSetActive(workspaceId, groupId);
  // Backward-compatibility: keep legacy last-active key in sync for older builds.
  try {
    localStorage.setItem(LAST_ACTIVE_GROUP_KEY, groupKey(workspaceId, groupId));
  } catch {
    /* best-effort legacy mirror */
  }
}

/** One-time migration from legacy localStorage snapshots into SQLite. */
export async function migrateLocalStorageToSqlite(): Promise<void> {
  const flag = "ai-inventory-group-layout-migrated";
  if (localStorage.getItem(flag)) return;

  try {
    const raw = localStorage.getItem(GROUP_LAYOUTS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, GroupLayoutSnapshot>;
      for (const [key, snapshot] of Object.entries(all)) {
        const ids = parseGroupKey(key);
        if (!ids || !snapshot.panes?.length) continue;
        await saveGroupSnapshot(ids.workspaceId, ids.groupId, snapshot);
      }
    }

    const last = localStorage.getItem(LAST_ACTIVE_GROUP_KEY);
    if (last) {
      const ids = parseGroupKey(last);
      if (ids) await saveLastActiveGroupKey(ids.workspaceId, ids.groupId);
    }

    localStorage.removeItem(GROUP_LAYOUTS_KEY);
    localStorage.removeItem(LAST_ACTIVE_GROUP_KEY);
    localStorage.setItem(flag, "1");
  } catch {
    /* best-effort */
  }
}

export function getGroupPaneCount(
  groupLayouts: Record<string, { paneCount: number }> | undefined,
  workspaceId: string,
  groupId: string,
): number {
  return groupLayouts?.[groupKey(workspaceId, groupId)]?.paneCount ?? 0;
}

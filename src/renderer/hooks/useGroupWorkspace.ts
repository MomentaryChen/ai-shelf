import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { GroupInfo, WorkspaceInfo } from "../types";
import {
  collectPanes,
  type LayoutNode,
  type PaneInfo,
} from "../terminal/split-tree";
import {
  buildHorizontalLayout,
  deserializeLayout,
  serializeLayout,
  type SavedPaneSlot,
} from "../terminal/layout-serialize";
import {
  groupKey,
  loadGroupSnapshot,
  loadLastActiveGroupKey,
  MAX_GROUP_PANES,
  migrateLocalStorageToSqlite,
  saveGroupSnapshot,
  saveLastActiveGroupKey,
  type GroupLayoutSnapshot,
} from "../terminal/group-layout-storage";

export interface ActiveGroup {
  workspace: WorkspaceInfo;
  group: GroupInfo;
}

function teardownPtys(node: LayoutNode | null) {
  for (const p of collectPanes(node)) {
    window.api.ptyKill(p.sessionId);
  }
}

export function useGroupWorkspace(
  layout: LayoutNode | null,
  setLayout: Dispatch<SetStateAction<LayoutNode | null>>,
  setFocusedPaneId: Dispatch<SetStateAction<string | null>>,
  spawnPane: (tool: string, cwd: string) => Promise<PaneInfo | null>,
  workingDir: string,
) {
  const [activeGroup, setActiveGroup] = useState<ActiveGroup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);
  const layoutRef = useRef(layout);
  const activeGroupRef = useRef(activeGroup);
  const workingDirRef = useRef(workingDir);

  layoutRef.current = layout;
  activeGroupRef.current = activeGroup;
  workingDirRef.current = workingDir;

  useEffect(() => {
    void migrateLocalStorageToSqlite().finally(() => setMigrationDone(true));
  }, []);

  const persistCurrentGroup = useCallback(async () => {
    const group = activeGroupRef.current;
    const node = layoutRef.current;
    if (!group || !node) return;

    const collected = collectPanes(node).slice(0, MAX_GROUP_PANES);
    if (collected.length === 0) return;

    const { layout: serialized, panes } = serializeLayout(node);
    const defaultCwd =
      workingDirRef.current || collected[0]?.cwd || group.workspace.root_path || "";

    const snapshot: GroupLayoutSnapshot = {
      defaultCwd,
      panes,
      layout: collected.length > 1 ? serialized : null,
      updatedAt: new Date().toISOString(),
    };
    await saveGroupSnapshot(group.workspace.id, group.group.id, snapshot);
  }, []);

  const restoreSnapshot = useCallback(
    async (snapshot: GroupLayoutSnapshot, ws: WorkspaceInfo, grp: GroupInfo) => {
      setRestoring(true);
      teardownPtys(layoutRef.current);
      setLayout(null);
      setFocusedPaneId(null);

      const cwdDefault = snapshot.defaultCwd || ws.root_path || workingDirRef.current || "";
      const slots = snapshot.panes.slice(0, MAX_GROUP_PANES);
      const spawned: PaneInfo[] = [];

      for (const slot of slots) {
        const pane = await spawnPane(slot.tool, slot.cwd || cwdDefault);
        if (pane) spawned.push(pane);
      }

      if (spawned.length === 0) {
        setRestoring(false);
        return cwdDefault;
      }

      let next: LayoutNode | null = null;
      if (snapshot.layout && spawned.length > 1) {
        next = deserializeLayout(snapshot.layout, spawned);
      }
      if (!next) {
        next = buildHorizontalLayout(spawned);
      }

      setLayout(next);
      setFocusedPaneId(spawned[0]?.id ?? null);
      setRestoring(false);
      return cwdDefault;
    },
    [setLayout, setFocusedPaneId, spawnPane],
  );

  const activateGroup = useCallback(
    async (ws: WorkspaceInfo, grp: GroupInfo) => {
      const prev = activeGroupRef.current;
      if (prev && groupKey(prev.workspace.id, prev.group.id) !== groupKey(ws.id, grp.id)) {
        await persistCurrentGroup();
        teardownPtys(layoutRef.current);
      }

      await saveLastActiveGroupKey(ws.id, grp.id);
      setActiveGroup({ workspace: ws, group: grp });

      const snapshot = await loadGroupSnapshot(ws.id, grp.id);
      if (snapshot && snapshot.panes.length > 0) {
        return restoreSnapshot(snapshot, ws, grp);
      }

      teardownPtys(layoutRef.current);
      setLayout(null);
      setFocusedPaneId(null);
      return ws.root_path || workingDirRef.current || "";
    },
    [persistCurrentGroup, restoreSnapshot, setLayout, setFocusedPaneId],
  );

  const restoreLastGroup = useCallback(
    async (tree: {
      workspaces: WorkspaceInfo[];
      groups: Record<string, GroupInfo[]>;
      lastActiveGroupKey?: string | null;
    }) => {
      if (!migrationDone) return;

      const lastKey = tree.lastActiveGroupKey ?? (await loadLastActiveGroupKey());
      if (!lastKey) return;

      const colon = lastKey.indexOf(":");
      if (colon <= 0) return;
      const wsId = lastKey.slice(0, colon);
      const grpId = lastKey.slice(colon + 1);

      const ws = tree.workspaces.find((w) => w.id === wsId);
      if (!ws) return;
      const grp = (tree.groups[wsId] ?? []).find((g) => g.id === grpId);
      if (!grp) return;

      const cwd = await activateGroup(ws, grp);
      return { ws, grp, cwd };
    },
    [activateGroup, migrationDone],
  );

  useEffect(() => {
    if (!activeGroup || !layout || restoring) return;
    const t = window.setTimeout(() => {
      void persistCurrentGroup();
    }, 400);
    return () => window.clearTimeout(t);
  }, [layout, activeGroup, workingDir, restoring, persistCurrentGroup]);

  useEffect(() => {
    return () => {
      void persistCurrentGroup();
    };
  }, [persistCurrentGroup]);

  const canAddPane = !layout || collectPanes(layout).length < MAX_GROUP_PANES;

  return {
    activeGroup,
    activeGroupKey: activeGroup
      ? groupKey(activeGroup.workspace.id, activeGroup.group.id)
      : null,
    restoring,
    migrationDone,
    activateGroup,
    restoreLastGroup,
    persistCurrentGroup,
    canAddPane,
    maxPanes: MAX_GROUP_PANES,
  };
}

export type { SavedPaneSlot };

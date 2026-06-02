import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ProfileForest, ProfileInfo } from "../types";
import {
  collectPanes,
  findPane,
  mapPanesInTree,
  movePaneInTree,
  type LayoutNode,
  type PaneInfo,
} from "../terminal/split-tree";
import type { PaneDropZone } from "../terminal/pane-drop-zone";
import {
  buildHorizontalLayout,
  deserializeLayout,
  serializeLayout,
} from "../terminal/layout-serialize";
import { normalizePaneTitle } from "../utils/pane-label";
import {
  loadGroupSnapshot,
  MAX_GROUP_PANES,
  migrateLocalStorageToSqlite,
  saveGroupSnapshot,
  saveLastActiveGroupKey,
  type GroupLayoutSnapshot,
} from "../terminal/group-layout-storage";
import {
  buildDisplayLayout,
  minimizedForSingleDisplay,
  minimizedSet,
  unminimizePaneIds,
} from "../terminal/profile-pane-display";

interface ProfileLiveState {
  layout: LayoutNode;
  focusedPaneId: string | null;
  minimizedPaneIds: string[];
}

function teardownPtys(node: LayoutNode | null) {
  for (const p of collectPanes(node)) {
    window.api.ptyKill(p.sessionId);
  }
}

function applyLayout(
  setLayout: Dispatch<SetStateAction<LayoutNode | null>>,
  setFocusedPaneId: Dispatch<SetStateAction<string | null>>,
  layoutRef: { current: LayoutNode | null },
  next: LayoutNode | null,
  focusId: string | null,
) {
  layoutRef.current = next;
  setLayout(next);
  setFocusedPaneId(focusId);
}

/** Respawn panes whose PTY no longer exists in the main process (e.g. after crash or rebuild). */
async function reconcileLayoutPtys(
  node: LayoutNode,
  spawnPane: (tool: string, cwd: string) => Promise<PaneInfo | null>,
): Promise<LayoutNode> {
  let next = node;
  for (const pane of collectPanes(node)) {
    const attached = await window.api.ptyAttach(pane.sessionId);
    if (attached.alive) continue;

    window.api.ptyKill(pane.sessionId);
    let replacement = await spawnPane(pane.tool, pane.cwd);
    if (!replacement && pane.tool !== "shell") {
      replacement = await spawnPane("shell", pane.cwd);
    }
    if (!replacement) replacement = await spawnPane("shell", "");

    if (!replacement) continue;

    next = mapPanesInTree(next, (p) =>
      p.id === pane.id
        ? { ...replacement, id: pane.id, cwd: pane.cwd || replacement.cwd, title: pane.title }
        : p,
    );
  }
  return next;
}

export function useProfileWorkspace(
  layout: LayoutNode | null,
  setLayout: Dispatch<SetStateAction<LayoutNode | null>>,
  focusedPaneId: string | null,
  setFocusedPaneId: Dispatch<SetStateAction<string | null>>,
  spawnPane: (tool: string, cwd: string) => Promise<PaneInfo | null>,
  workingDir: string,
  broadcastInput: boolean,
) {
  const [activeProfile, setActiveProfile] = useState<ProfileInfo | null>(null);
  const [minimizedPaneIds, setMinimizedPaneIds] = useState<Set<string>>(() => new Set());
  const [restoring, setRestoring] = useState(false);
  /** Synced with setRestoringFlag — avoids stale `restoring` after await activateProfile. */
  const restoringRef = useRef(false);
  const setRestoringFlag = useCallback((value: boolean) => {
    restoringRef.current = value;
    setRestoring(value);
  }, []);
  const [migrationDone, setMigrationDone] = useState(false);
  const layoutRef = useRef(layout);
  const focusedPaneIdRef = useRef(focusedPaneId);
  const activeProfileRef = useRef(activeProfile);
  const workingDirRef = useRef(workingDir);
  const broadcastRef = useRef(broadcastInput);
  /** Live PTY + layout per profile — survives sidebar profile switches. */
  const profileLiveCacheRef = useRef(new Map<string, ProfileLiveState>());
  const cacheKey = useCallback((workspaceId: string, profileId: string) => `${workspaceId}:${profileId}`, []);
  /** True while activateProfile clears layout between profiles (avoids wiping stashed cache). */
  const profileSwitchInProgressRef = useRef(false);

  layoutRef.current = layout;
  focusedPaneIdRef.current = focusedPaneId;
  activeProfileRef.current = activeProfile;
  workingDirRef.current = workingDir;
  broadcastRef.current = broadcastInput;

  useEffect(() => {
    void migrateLocalStorageToSqlite().finally(() => setMigrationDone(true));
  }, []);

  const persistCurrentProfile = useCallback(async () => {
    const profile = activeProfileRef.current;
    const node = layoutRef.current;
    if (!profile || !node) return;

    const collected = collectPanes(node).slice(0, MAX_GROUP_PANES);
    if (collected.length === 0) return;

    const { layout: serialized, panes } = serializeLayout(node);
    const existing = await loadGroupSnapshot(profile.workspaceId, profile.id);
    const snapshot: GroupLayoutSnapshot = {
      defaultCwd: existing?.defaultCwd ?? profile.defaultCwd ?? "",
      defaultTool: existing?.defaultTool ?? profile.defaultTool ?? "claude",
      panes,
      layout: collected.length > 1 ? serialized : null,
      broadcastInput: broadcastRef.current,
      accentColor: existing?.accentColor ?? profile.accentColor ?? null,
      updatedAt: new Date().toISOString(),
    };
    await saveGroupSnapshot(profile.workspaceId, profile.id, snapshot);
  }, []);

  const clearProfileSnapshot = useCallback(async (profile: ProfileInfo) => {
    const existing = await loadGroupSnapshot(profile.workspaceId, profile.id);
    await saveGroupSnapshot(profile.workspaceId, profile.id, {
      defaultCwd: existing?.defaultCwd ?? profile.defaultCwd ?? "",
      defaultTool: existing?.defaultTool ?? profile.defaultTool ?? "claude",
      panes: [],
      layout: null,
      broadcastInput: broadcastRef.current,
      accentColor: existing?.accentColor ?? profile.accentColor ?? null,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const minimizedPaneIdsRef = useRef(minimizedPaneIds);
  minimizedPaneIdsRef.current = minimizedPaneIds;

  const applyMinimizedPaneIds = useCallback((next: Set<string>) => {
    minimizedPaneIdsRef.current = next;
    setMinimizedPaneIds(next);
  }, []);

  const stashLiveProfile = useCallback((profile: ProfileInfo) => {
    const node = layoutRef.current;
    if (!node || collectPanes(node).length === 0) return;
    profileLiveCacheRef.current.set(cacheKey(profile.workspaceId, profile.id), {
      layout: node,
      focusedPaneId: focusedPaneIdRef.current,
      minimizedPaneIds: [...minimizedPaneIdsRef.current],
    });
  }, [cacheKey]);

  const discardProfileSessions = useCallback((profileId: string, workspaceId?: string) => {
    const ws =
      workspaceId ??
      activeProfileRef.current?.workspaceId ??
      Array.from(profileLiveCacheRef.current.keys())
        .map((k) => k.split(":"))
        .find((parts) => parts[1] === profileId)?.[0] ??
      "";
    const cached = profileLiveCacheRef.current.get(cacheKey(ws, profileId));
    if (cached) {
      teardownPtys(cached.layout);
      profileLiveCacheRef.current.delete(cacheKey(ws, profileId));
    }
    if (activeProfileRef.current?.id === profileId) {
      teardownPtys(layoutRef.current);
    }
  }, [cacheKey]);

  const restoreSnapshot = useCallback(
    async (snapshot: GroupLayoutSnapshot, profile: ProfileInfo) => {
      setRestoringFlag(true);
      // Only replace this profile's previous PTYs — never kill another profile's stashed sessions.
      const staleCached = profileLiveCacheRef.current.get(cacheKey(profile.workspaceId, profile.id));
      if (staleCached) teardownPtys(staleCached.layout);

      const cwdDefault =
        profile.defaultCwd || snapshot.defaultCwd || workingDirRef.current || "";
      const slots = snapshot.panes.slice(0, MAX_GROUP_PANES);
      const spawned: PaneInfo[] = [];

      for (const slot of slots) {
        const paneCwd = slot.cwd?.trim() || cwdDefault;
        let pane = await spawnPane(slot.tool, paneCwd);
        if (!pane && slot.tool !== "shell") {
          pane = await spawnPane("shell", paneCwd);
        }
        if (pane) {
          const title = normalizePaneTitle(slot.title ?? "");
          spawned.push(title ? { ...pane, title } : pane);
        }
      }

      if (spawned.length === 0) {
        applyLayout(setLayout, setFocusedPaneId, layoutRef, null, null);
        setRestoringFlag(false);
        return {
          cwd: cwdDefault,
          broadcastInput: snapshot.broadcastInput ?? false,
          paneCount: 0,
        };
      }

      let next: LayoutNode | null = null;
      if (snapshot.layout && spawned.length > 1) {
        next = deserializeLayout(snapshot.layout, spawned);
      }
      if (!next) next = buildHorizontalLayout(spawned);

      const reconciled = await reconcileLayoutPtys(next, spawnPane);
      const focusId = collectPanes(reconciled)[0]?.id ?? null;
      applyLayout(setLayout, setFocusedPaneId, layoutRef, reconciled, focusId);
      const minimized =
        focusId && collectPanes(reconciled).length > 1
          ? minimizedForSingleDisplay(reconciled, focusId)
          : [];
      applyMinimizedPaneIds(minimizedSet(minimized));
      profileLiveCacheRef.current.set(cacheKey(profile.workspaceId, profile.id), {
        layout: reconciled,
        focusedPaneId: focusId,
        minimizedPaneIds: minimized,
      });
      setRestoringFlag(false);
      return {
        cwd: profile.defaultCwd || cwdDefault,
        broadcastInput: snapshot.broadcastInput ?? false,
        paneCount: spawned.length,
      };
    },
    [setLayout, setFocusedPaneId, spawnPane, setRestoringFlag],
  );

  const activateProfile = useCallback(
    async (profile: ProfileInfo) => {
      profileSwitchInProgressRef.current = true;
      try {
      const prev = activeProfileRef.current;

      if (prev?.id === profile.id) {
        if (layoutRef.current && collectPanes(layoutRef.current).length > 0) {
          return {
            cwd: profile.defaultCwd || workingDirRef.current,
            broadcastInput: profile.broadcastInput,
            paneCount: collectPanes(layoutRef.current).length,
          };
        }

        const sameCached = profileLiveCacheRef.current.get(cacheKey(profile.workspaceId, profile.id));
        const sameCachedPanes = sameCached ? collectPanes(sameCached.layout).length : 0;
        if (sameCached && sameCachedPanes > 0) {
          const reconciled = await reconcileLayoutPtys(sameCached.layout, spawnPane);
          const panes = collectPanes(reconciled);
          const focusId =
            sameCached.focusedPaneId && panes.some((p) => p.id === sameCached.focusedPaneId)
              ? sameCached.focusedPaneId
              : panes[0]?.id ?? null;
          applyLayout(setLayout, setFocusedPaneId, layoutRef, reconciled, focusId);
          applyMinimizedPaneIds(minimizedSet(sameCached.minimizedPaneIds ?? []));
          profileLiveCacheRef.current.set(cacheKey(profile.workspaceId, profile.id), {
            layout: reconciled,
            focusedPaneId: focusId,
            minimizedPaneIds: sameCached.minimizedPaneIds ?? [],
          });
          return {
            cwd: profile.defaultCwd || panes[0]?.cwd || workingDirRef.current,
            broadcastInput: profile.broadcastInput,
            paneCount: panes.length,
          };
        }

        const snapshot = await loadGroupSnapshot(profile.workspaceId, profile.id);
        if (snapshot && snapshot.panes.length > 0) {
          const restored = await restoreSnapshot(snapshot, profile);
          if (restored.paneCount > 0) return restored;
        }

        applyMinimizedPaneIds(new Set());
        applyLayout(setLayout, setFocusedPaneId, layoutRef, null, null);
        return {
          cwd: profile.defaultCwd || workingDirRef.current || "",
          broadcastInput: profile.broadcastInput,
          paneCount: 0,
        };
      }

      const targetCached = profileLiveCacheRef.current.get(cacheKey(profile.workspaceId, profile.id));

      if (prev && prev.id !== profile.id) {
        await persistCurrentProfile();
        stashLiveProfile(prev);
        layoutRef.current = null;
        setLayout(null);
        setFocusedPaneId(null);
        applyMinimizedPaneIds(new Set());
      }

      await saveLastActiveGroupKey(profile.workspaceId, profile.id);
      setActiveProfile(profile);
      activeProfileRef.current = profile;

      const cached = targetCached ?? profileLiveCacheRef.current.get(cacheKey(profile.workspaceId, profile.id));
      const cachedPaneCount = cached ? collectPanes(cached.layout).length : 0;
      if (cached && cachedPaneCount > 0) {
        const reconciled = await reconcileLayoutPtys(cached.layout, spawnPane);
        const panes = collectPanes(reconciled);
        const focusId =
          cached.focusedPaneId && panes.some((p) => p.id === cached.focusedPaneId)
            ? cached.focusedPaneId
            : panes[0]?.id ?? null;
        applyLayout(setLayout, setFocusedPaneId, layoutRef, reconciled, focusId);
        applyMinimizedPaneIds(minimizedSet(cached.minimizedPaneIds ?? []));
        profileLiveCacheRef.current.set(cacheKey(profile.workspaceId, profile.id), {
          layout: reconciled,
          focusedPaneId: focusId,
          minimizedPaneIds: cached.minimizedPaneIds ?? [],
        });
        return {
          cwd: profile.defaultCwd || panes[0]?.cwd || workingDirRef.current,
          broadcastInput: profile.broadcastInput,
          paneCount: panes.length,
        };
      }

      const snapshot = await loadGroupSnapshot(profile.workspaceId, profile.id);
      if (snapshot && snapshot.panes.length > 0) {
        const restored = await restoreSnapshot(snapshot, profile);
        if (restored.paneCount > 0) return restored;
      }

      applyMinimizedPaneIds(new Set());
      applyLayout(setLayout, setFocusedPaneId, layoutRef, null, null);
      return {
        cwd: profile.defaultCwd || workingDirRef.current || "",
        broadcastInput: profile.broadcastInput,
        paneCount: 0,
      };
      } finally {
        // Let layout effects run while the switch guard is still set (avoids wiping stashed cache).
        queueMicrotask(() => {
          profileSwitchInProgressRef.current = false;
        });
      }
    },
    [
      persistCurrentProfile,
      stashLiveProfile,
      restoreSnapshot,
      setLayout,
      setFocusedPaneId,
      applyMinimizedPaneIds,
      spawnPane,
    ],
  );

  const restoreLastProfile = useCallback(
    async (forest: ProfileForest) => {
      if (!migrationDone) return;
      const group =
        forest.groups.find((g) => g.id === forest.lastActiveGroupId) ?? forest.groups[0];
      if (!group || group.profiles.length === 0) return;
      const profile =
        group.profiles.find((p) => p.id === forest.lastActiveProfileId) ?? group.profiles[0];
      const r = await activateProfile(profile);
      return { profile, ...r };
    },
    [activateProfile, migrationDone],
  );

  useEffect(() => {
    if (!activeProfile || restoringRef.current || profileSwitchInProgressRef.current) return;
    const paneCount = layout ? collectPanes(layout).length : 0;
    if (paneCount > 0) {
      profileLiveCacheRef.current.set(cacheKey(activeProfile.workspaceId, activeProfile.id), {
        layout: layout!,
        focusedPaneId: focusedPaneIdRef.current,
        minimizedPaneIds: [...minimizedPaneIdsRef.current],
      });
      const t = window.setTimeout(() => {
        void persistCurrentProfile();
      }, 400);
      return () => window.clearTimeout(t);
    }
    profileLiveCacheRef.current.delete(cacheKey(activeProfile.workspaceId, activeProfile.id));
    void clearProfileSnapshot(activeProfile);
  }, [layout, focusedPaneId, activeProfile, workingDir, broadcastInput, restoring, persistCurrentProfile, clearProfileSnapshot]);

  const getProfilePanes = useCallback(
    (profileId: string): PaneInfo[] => {
      if (activeProfile?.id === profileId) {
        return layout ? collectPanes(layout) : [];
      }
      const cached = profileLiveCacheRef.current.get(profileId);
      return cached ? collectPanes(cached.layout) : [];
    },
    [activeProfile, layout],
  );

  const getProfileFocusedPaneId = useCallback(
    (profileId: string): string | null => {
      if (activeProfile?.id === profileId) return focusedPaneId;
      return profileLiveCacheRef.current.get(profileId)?.focusedPaneId ?? null;
    },
    [activeProfile, focusedPaneId],
  );

  const hasLiveSessions = useCallback(
    (profileId: string) => getProfilePanes(profileId).length > 0,
    [getProfilePanes],
  );

  // Persist on unmount only — do not ptyKill here (breaks Strict Mode / profile switch cache).
  useEffect(() => {
    return () => {
      void persistCurrentProfile();
    };
  }, [persistCurrentProfile]);

  const syncActiveProfile = useCallback((profile: ProfileInfo) => {
    if (activeProfileRef.current?.id !== profile.id) return;
    activeProfileRef.current = profile;
    setActiveProfile(profile);
  }, []);

  const getProfileDefaultCwd = useCallback((): string => {
    return activeProfileRef.current?.defaultCwd?.trim() ?? "";
  }, []);

  const canAddPane = !layout || collectPanes(layout).length < MAX_GROUP_PANES;

  const getProfileMinimizedPaneIds = useCallback(
    (profileId: string): Set<string> => {
      if (activeProfile?.id === profileId) return minimizedPaneIdsRef.current;
      const cached = profileLiveCacheRef.current.get(profileId);
      return minimizedSet(cached?.minimizedPaneIds ?? []);
    },
    [activeProfile],
  );

  const isPaneMinimized = useCallback(
    (profileId: string, paneId: string): boolean => {
      return getProfileMinimizedPaneIds(profileId).has(paneId);
    },
    [getProfileMinimizedPaneIds],
  );

  const syncLiveCacheDisplay = useCallback(
    (profileId: string, focusId: string | null, minimized: string[]) => {
      const cached = profileLiveCacheRef.current.get(profileId);
      if (!cached) return;
      profileLiveCacheRef.current.set(profileId, {
        ...cached,
        focusedPaneId: focusId,
        minimizedPaneIds: minimized,
      });
    },
    [],
  );

  const showPaneInDisplay = useCallback(
    (profileId: string, paneId: string) => {
      if (activeProfileRef.current?.id !== profileId) return;
      const node = layoutRef.current;
      if (!node || !findPane(node, paneId)) return;
      const minimized = minimizedForSingleDisplay(node, paneId);
      applyMinimizedPaneIds(minimizedSet(minimized));
      setFocusedPaneId(paneId);
      syncLiveCacheDisplay(profileId, paneId, minimized);
    },
    [applyMinimizedPaneIds, setFocusedPaneId, syncLiveCacheDisplay],
  );

  const minimizePane = useCallback(
    (profileId: string, paneId: string) => {
      if (activeProfileRef.current?.id !== profileId) return;
      const node = layoutRef.current;
      if (!node || !findPane(node, paneId)) return;
      const next = new Set(minimizedPaneIdsRef.current);
      next.add(paneId);
      applyMinimizedPaneIds(next);
      const visible = collectPanes(node).filter((p) => !next.has(p.id));
      const nextFocus =
        visible.length > 0
          ? next.has(focusedPaneIdRef.current ?? "")
            ? visible[0]!.id
            : focusedPaneIdRef.current
          : null;
      setFocusedPaneId(nextFocus);
      syncLiveCacheDisplay(profileId, nextFocus, [...next]);
    },
    [applyMinimizedPaneIds, setFocusedPaneId, syncLiveCacheDisplay],
  );

  const unminimizePanes = useCallback(
    (profileId: string, paneIds: string[]) => {
      if (activeProfileRef.current?.id !== profileId) return;
      const next = unminimizePaneIds(minimizedPaneIdsRef.current, paneIds);
      applyMinimizedPaneIds(next);
      syncLiveCacheDisplay(profileId, focusedPaneIdRef.current, [...next]);
    },
    [applyMinimizedPaneIds, syncLiveCacheDisplay],
  );

  /** Show a pane next to a target (edge drop / Shift+click) without hiding other visible panes. */
  const placePaneInDisplay = useCallback(
    (profileId: string, dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => {
      if (activeProfileRef.current?.id !== profileId) return;
      let node = layoutRef.current;
      if (!node || !findPane(node, dragPaneId) || !findPane(node, targetPaneId)) return;

      if (dragPaneId !== targetPaneId) {
        node = movePaneInTree(node, dragPaneId, targetPaneId, zone);
        layoutRef.current = node;
        setLayout(node);
      }

      const nextMinimized = new Set(minimizedPaneIdsRef.current);
      nextMinimized.delete(dragPaneId);
      nextMinimized.delete(targetPaneId);
      applyMinimizedPaneIds(nextMinimized);
      setFocusedPaneId(dragPaneId);
      syncLiveCacheDisplay(profileId, dragPaneId, [...nextMinimized]);
    },
    [setLayout, applyMinimizedPaneIds, setFocusedPaneId, syncLiveCacheDisplay],
  );

  const forgetMinimizedPane = useCallback(
    (profileId: string, paneId: string) => {
      if (activeProfileRef.current?.id !== profileId) return;
      const next = new Set(minimizedPaneIdsRef.current);
      next.delete(paneId);
      applyMinimizedPaneIds(next);
    },
    [applyMinimizedPaneIds],
  );

  const displayLayout = layout
    ? buildDisplayLayout(layout, minimizedPaneIds, focusedPaneId)
    : null;

  return {
    activeProfile,
    restoring,
    isRestoring: () => restoringRef.current,
    migrationDone,
    activateProfile,
    restoreLastProfile,
    persistCurrentProfile,
    syncActiveProfile,
    getProfileDefaultCwd,
    discardProfileSessions,
    getProfilePanes,
    getProfileFocusedPaneId,
    getProfileMinimizedPaneIds,
    hasLiveSessions,
    canAddPane,
    maxPanes: MAX_GROUP_PANES,
    minimizedPaneIds,
    displayLayout,
    isPaneMinimized,
    showPaneInDisplay,
    placePaneInDisplay,
    minimizePane,
    unminimizePanes,
    forgetMinimizedPane,
  };
}

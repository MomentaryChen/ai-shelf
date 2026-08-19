import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
    const attached = await window.api.ptyAttach(pane.sessionId, { includeBuffer: false });
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
  const isRestoring = useCallback(() => restoringRef.current, []);
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
  /** Bumps on every activate so superseded async switches skip layout writes. */
  const activateGenerationRef = useRef(0);

  layoutRef.current = layout;
  focusedPaneIdRef.current = focusedPaneId;
  activeProfileRef.current = activeProfile;
  workingDirRef.current = workingDir;
  broadcastRef.current = broadcastInput;

  useEffect(() => {
    void migrateLocalStorageToSqlite().finally(() => setMigrationDone(true));
  }, []);

  const persistGenerationRef = useRef(new Map<string, number>());

  /** Persist the given profile using an explicit layout tree (or the live layout). */
  const persistProfile = useCallback(async (profile?: ProfileInfo | null, node?: LayoutNode | null) => {
    const target = profile ?? activeProfileRef.current;
    if (!target) return;
    const key = `${target.workspaceId}:${target.id}`;
    const generation = (persistGenerationRef.current.get(key) ?? 0) + 1;
    persistGenerationRef.current.set(key, generation);
    const layoutNode = node !== undefined ? node : layoutRef.current;
    const collected = layoutNode ? collectPanes(layoutNode).slice(0, MAX_GROUP_PANES) : [];
    const existing = await loadGroupSnapshot(target.workspaceId, target.id);
    if (persistGenerationRef.current.get(key) !== generation) return;
    const serialized =
      layoutNode && collected.length > 0 ? serializeLayout(layoutNode) : { layout: null, panes: [] };
    const snapshot: GroupLayoutSnapshot = {
      defaultCwd: existing?.defaultCwd ?? target.defaultCwd ?? "",
      defaultTool: existing?.defaultTool ?? target.defaultTool ?? "claude",
      panes: collected.length > 0 ? serialized.panes : [],
      layout: collected.length > 1 ? serialized.layout : null,
      broadcastInput: broadcastRef.current,
      accentColor: existing?.accentColor ?? target.accentColor ?? null,
      savedCommands: existing?.savedCommands ?? target.savedCommands ?? [],
      updatedAt: new Date().toISOString(),
    };
    await saveGroupSnapshot(target.workspaceId, target.id, snapshot);
  }, []);

  const persistCurrentProfile = useCallback(async () => {
    await persistProfile();
  }, [persistProfile]);

  const persistTimerRef = useRef<number | null>(null);
  const persistInFlightRef = useRef<Promise<void> | null>(null);
  const persistPaneCountRef = useRef(0);
  const persistProfileIdRef = useRef<string | null>(null);

  const runPersist = useCallback(async () => {
    if (persistInFlightRef.current) {
      await persistInFlightRef.current;
      return;
    }
    const run = persistCurrentProfile().finally(() => {
      if (persistInFlightRef.current === run) persistInFlightRef.current = null;
    });
    persistInFlightRef.current = run;
    await run;
  }, [persistCurrentProfile]);

  const flushPersistCurrentProfile = useCallback(async () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    while (persistInFlightRef.current) {
      await persistInFlightRef.current;
    }
    await runPersist();
  }, [runPersist]);

  const minimizedPaneIdsRef = useRef(minimizedPaneIds);
  minimizedPaneIdsRef.current = minimizedPaneIds;

  const applyMinimizedPaneIds = useCallback((next: Set<string>) => {
    // Skip the state update when the set is unchanged — unminimizePaneIds and
    // friends always return a fresh Set, so without this guard every pane focus
    // re-renders (rebuilding the layout tree) and refits terminals → flicker.
    const prev = minimizedPaneIdsRef.current;
    if (prev.size === next.size && [...prev].every((id) => next.has(id))) return;
    minimizedPaneIdsRef.current = next;
    setMinimizedPaneIds(next);
  }, []);

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
    async (
      snapshot: GroupLayoutSnapshot,
      profile: ProfileInfo,
      stillActive: () => boolean = () => true,
    ) => {
      setRestoringFlag(true);
      // Only replace this profile's previous PTYs — never kill another profile's stashed sessions.
      const staleCached = profileLiveCacheRef.current.get(cacheKey(profile.workspaceId, profile.id));
      if (staleCached) teardownPtys(staleCached.layout);

      const cwdDefault =
        profile.defaultCwd || snapshot.defaultCwd || workingDirRef.current || "";
      const slots = snapshot.panes.slice(0, MAX_GROUP_PANES);
      const spawned: PaneInfo[] = [];

      for (const slot of slots) {
        if (!stillActive()) {
          for (const p of spawned) window.api.ptyKill(p.sessionId);
          setRestoringFlag(false);
          return {
            cwd: cwdDefault,
            broadcastInput: snapshot.broadcastInput ?? false,
            paneCount: 0,
          };
        }
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

      if (!stillActive()) {
        for (const p of spawned) window.api.ptyKill(p.sessionId);
        setRestoringFlag(false);
        return {
          cwd: cwdDefault,
          broadcastInput: snapshot.broadcastInput ?? false,
          paneCount: 0,
        };
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

      // spawned is non-empty (guarded above), so next is always a layout here.
      const reconciled = await reconcileLayoutPtys(next!, spawnPane);
      if (!stillActive()) {
        teardownPtys(reconciled);
        setRestoringFlag(false);
        return {
          cwd: cwdDefault,
          broadcastInput: snapshot.broadcastInput ?? false,
          paneCount: 0,
        };
      }
      const focusId = collectPanes(reconciled)[0]?.id ?? null;
      applyLayout(setLayout, setFocusedPaneId, layoutRef, reconciled, focusId);
      // Restore full layout visibility from snapshot; do not auto-minimize sibling panes.
      const minimized: string[] = [];
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
    [setLayout, setFocusedPaneId, spawnPane, setRestoringFlag, applyMinimizedPaneIds, cacheKey],
  );

  const activateProfile = useCallback(
    async (profile: ProfileInfo) => {
      const generation = ++activateGenerationRef.current;
      profileSwitchInProgressRef.current = true;
      const isCurrent = () => generation === activateGenerationRef.current;
      try {
        const prev = activeProfileRef.current;
        const sameProfile =
          prev?.id === profile.id && prev.workspaceId === profile.workspaceId;

        if (sameProfile) {
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
            profileLiveCacheRef.current.set(cacheKey(profile.workspaceId, profile.id), {
              layout: reconciled,
              focusedPaneId: focusId,
              minimizedPaneIds: sameCached.minimizedPaneIds ?? [],
            });
            if (!isCurrent()) return undefined;
            applyLayout(setLayout, setFocusedPaneId, layoutRef, reconciled, focusId);
            applyMinimizedPaneIds(minimizedSet(sameCached.minimizedPaneIds ?? []));
            return {
              cwd: profile.defaultCwd || panes[0]?.cwd || workingDirRef.current,
              broadcastInput: profile.broadcastInput,
              paneCount: panes.length,
            };
          }

          // Already active with no live panes — user closed them. Do not respawn
          // from a stale snapshot (that would put a terminal back on the display).
          if (!isCurrent()) return undefined;
          applyMinimizedPaneIds(new Set());
          applyLayout(setLayout, setFocusedPaneId, layoutRef, null, null);
          return {
            cwd: profile.defaultCwd || workingDirRef.current || "",
            broadcastInput: profile.broadcastInput,
            paneCount: 0,
          };
        }

        const targetCached = profileLiveCacheRef.current.get(cacheKey(profile.workspaceId, profile.id));

        // Sync handoff before any await: stash/clear outgoing so concurrent activates
        // cannot persist mixed (new profile + old layout) state, then paint selection.
        let outgoingPersist: Promise<void> | null = null;
        if (prev) {
          const outgoingLayout = layoutRef.current;
          if (outgoingLayout && collectPanes(outgoingLayout).length > 0) {
            profileLiveCacheRef.current.set(cacheKey(prev.workspaceId, prev.id), {
              layout: outgoingLayout,
              focusedPaneId: focusedPaneIdRef.current,
              minimizedPaneIds: [...minimizedPaneIdsRef.current],
            });
            outgoingPersist = persistProfile(prev, outgoingLayout);
          }
          layoutRef.current = null;
          setLayout(null);
          setFocusedPaneId(null);
          applyMinimizedPaneIds(new Set());
        }

        setActiveProfile(profile);
        activeProfileRef.current = profile;
        void saveLastActiveGroupKey(profile.workspaceId, profile.id);
        // Disk persist can finish in the background — live cache already holds the tree.
        if (outgoingPersist) void outgoingPersist;

        const cached = targetCached ?? profileLiveCacheRef.current.get(cacheKey(profile.workspaceId, profile.id));
        const cachedPaneCount = cached ? collectPanes(cached.layout).length : 0;
        if (cached && cachedPaneCount > 0) {
          const reconciled = await reconcileLayoutPtys(cached.layout, spawnPane);
          const panes = collectPanes(reconciled);
          const focusId =
            cached.focusedPaneId && panes.some((p) => p.id === cached.focusedPaneId)
              ? cached.focusedPaneId
              : panes[0]?.id ?? null;
          profileLiveCacheRef.current.set(cacheKey(profile.workspaceId, profile.id), {
            layout: reconciled,
            focusedPaneId: focusId,
            minimizedPaneIds: cached.minimizedPaneIds ?? [],
          });
          if (!isCurrent()) return undefined;
          applyLayout(setLayout, setFocusedPaneId, layoutRef, reconciled, focusId);
          applyMinimizedPaneIds(minimizedSet(cached.minimizedPaneIds ?? []));
          return {
            cwd: profile.defaultCwd || panes[0]?.cwd || workingDirRef.current,
            broadcastInput: profile.broadcastInput,
            paneCount: panes.length,
          };
        }

        const snapshot = await loadGroupSnapshot(profile.workspaceId, profile.id);
        if (!isCurrent()) return undefined;
        if (snapshot && snapshot.panes.length > 0) {
          const restored = await restoreSnapshot(snapshot, profile, isCurrent);
          if (!isCurrent()) return undefined;
          if (restored.paneCount > 0) return restored;
        }

        if (!isCurrent()) return undefined;
        applyMinimizedPaneIds(new Set());
        applyLayout(setLayout, setFocusedPaneId, layoutRef, null, null);
        return {
          cwd: profile.defaultCwd || workingDirRef.current || "",
          broadcastInput: profile.broadcastInput,
          paneCount: 0,
        };
      } finally {
        // Let layout effects run while the switch guard is still set (avoids wiping stashed cache).
        // Only the latest activation may clear the guard.
        queueMicrotask(() => {
          if (generation === activateGenerationRef.current) {
            profileSwitchInProgressRef.current = false;
          }
        });
      }
    },
    [
      persistProfile,
      restoreSnapshot,
      setLayout,
      setFocusedPaneId,
      applyMinimizedPaneIds,
      spawnPane,
      cacheKey,
    ],
  );

  const restoreLastProfile = useCallback(
    async (forest: ProfileForest) => {
      if (!migrationDone) return;
      const group =
        forest.groups.find((g) => g.id === forest.lastActiveGroupId) ?? forest.groups[0];
      if (!group || group.profiles.length === 0) return;
      const profile =
        group.profiles.find((p) => p.id === forest.lastActiveProfileId) ?? group.profiles[0]!;
      const r = await activateProfile(profile);
      return { profile, ...r };
    },
    [activateProfile, migrationDone],
  );

  useEffect(() => {
    if (!activeProfile || restoringRef.current || profileSwitchInProgressRef.current) return;
    const paneCount = layout ? collectPanes(layout).length : 0;
    const sameProfile = persistProfileIdRef.current === activeProfile.id;
    const prevCount = sameProfile ? persistPaneCountRef.current : 0;
    persistProfileIdRef.current = activeProfile.id;
    persistPaneCountRef.current = paneCount;

    const schedulePersist = () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        void runPersist();
      }, 400);
    };

    if (paneCount > 0) {
      profileLiveCacheRef.current.set(cacheKey(activeProfile.workspaceId, activeProfile.id), {
        layout: layout!,
        focusedPaneId: focusedPaneIdRef.current,
        minimizedPaneIds: [...minimizedPaneIdsRef.current],
      });
      schedulePersist();
      return () => {
        if (persistTimerRef.current !== null) {
          window.clearTimeout(persistTimerRef.current);
          persistTimerRef.current = null;
        }
      };
    }
    profileLiveCacheRef.current.delete(cacheKey(activeProfile.workspaceId, activeProfile.id));
    // Persist empty only after the user closed the last live pane — not when
    // restore produced zero panes (spawn failure must keep the snapshot).
    if (sameProfile && prevCount > 0) {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      void persistProfile(activeProfile, null);
    }
  }, [layout, focusedPaneId, activeProfile, workingDir, broadcastInput, restoring, runPersist, persistProfile, cacheKey]);

  const getProfilePanes = useCallback(
    (profileId: string): PaneInfo[] => {
      if (activeProfileRef.current?.id === profileId) {
        return layoutRef.current ? collectPanes(layoutRef.current) : [];
      }
      const cached =
        Array.from(profileLiveCacheRef.current.entries()).find(([key]) =>
          key.endsWith(`:${profileId}`),
        )?.[1] ?? null;
      return cached ? collectPanes(cached.layout) : [];
    },
    [activeProfile],
  );

  const getProfileFocusedPaneId = useCallback(
    (profileId: string): string | null => {
      if (activeProfileRef.current?.id === profileId) return focusedPaneIdRef.current;
      const cached =
        Array.from(profileLiveCacheRef.current.entries()).find(([key]) =>
          key.endsWith(`:${profileId}`),
        )?.[1] ?? null;
      return cached?.focusedPaneId ?? null;
    },
    [activeProfile, focusedPaneId],
  );

  const hasLiveSessions = useCallback(
    (profileId: string) => getProfilePanes(profileId).length > 0,
    [getProfilePanes],
  );

  const isPaneLive = useCallback(
    (workspaceId: string, profileId: string, paneId: string): boolean => {
      const key = cacheKey(workspaceId, profileId);
      let panes: PaneInfo[];
      if (
        activeProfile?.id === profileId &&
        activeProfile.workspaceId === workspaceId
      ) {
        panes = layout ? collectPanes(layout) : [];
      } else {
        const cached = profileLiveCacheRef.current.get(key);
        panes = cached ? collectPanes(cached.layout) : [];
      }
      return panes.some((p) => p.id === paneId);
    },
    [activeProfile, layout, cacheKey],
  );

  // Flush on unmount — do not ptyKill here (breaks Strict Mode / profile switch cache).
  useEffect(() => {
    return () => {
      void flushPersistCurrentProfile();
    };
  }, [flushPersistCurrentProfile]);

  const syncActiveProfile = useCallback((profile: ProfileInfo) => {
    if (activeProfileRef.current?.id !== profile.id) return;
    activeProfileRef.current = profile;
    setActiveProfile(profile);
  }, []);

  /** Keep live PTY cache when a profile is moved to another workspace (group). */
  const remapProfileWorkspace = useCallback(
    (profileId: string, fromWorkspaceId: string, toWorkspaceId: string) => {
      if (!fromWorkspaceId || !toWorkspaceId || fromWorkspaceId === toWorkspaceId) return;
      const fromKey = cacheKey(fromWorkspaceId, profileId);
      const toKey = cacheKey(toWorkspaceId, profileId);
      const cached = profileLiveCacheRef.current.get(fromKey);
      if (cached) {
        profileLiveCacheRef.current.delete(fromKey);
        profileLiveCacheRef.current.set(toKey, cached);
      }
      const active = activeProfileRef.current;
      if (active?.id === profileId) {
        const next = { ...active, workspaceId: toWorkspaceId };
        activeProfileRef.current = next;
        setActiveProfile(next);
      }
    },
    [cacheKey],
  );

  const getProfileDefaultCwd = useCallback((): string => {
    return activeProfileRef.current?.defaultCwd?.trim() ?? "";
  }, []);

  const canAddPane = !layout || collectPanes(layout).length < MAX_GROUP_PANES;

  const getProfileMinimizedPaneIds = useCallback(
    (profileId: string): Set<string> => {
      if (activeProfile?.id === profileId) return minimizedPaneIdsRef.current;
      const cached =
        Array.from(profileLiveCacheRef.current.entries()).find(([key]) =>
          key.endsWith(`:${profileId}`),
        )?.[1] ?? null;
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
      const active = activeProfileRef.current;
      if (!active || active.id !== profileId) return;
      const key = cacheKey(active.workspaceId, profileId);
      const cached = profileLiveCacheRef.current.get(key);
      if (!cached) {
        if (!layoutRef.current) return;
        profileLiveCacheRef.current.set(key, {
          layout: layoutRef.current,
          focusedPaneId: focusId,
          minimizedPaneIds: minimized,
        });
        return;
      }
      profileLiveCacheRef.current.set(key, {
        ...cached,
        focusedPaneId: focusId,
        minimizedPaneIds: minimized,
      });
    },
    [cacheKey],
  );

  /** Focus a pane and show it without hiding other visible panes (preserves split layout). */
  const focusPaneInDisplay = useCallback(
    (profileId: string, paneId: string) => {
      if (activeProfileRef.current?.id !== profileId) return;
      const node = layoutRef.current;
      if (!node || !findPane(node, paneId)) return;
      // Already the focused, visible pane → nothing to change. Without this,
      // every mousedown inside the focused pane churns state and flickers.
      if (
        focusedPaneIdRef.current === paneId &&
        !minimizedPaneIdsRef.current.has(paneId)
      ) {
        return;
      }
      const nextMinimized = unminimizePaneIds(minimizedPaneIdsRef.current, [paneId]);
      applyMinimizedPaneIds(nextMinimized);
      setFocusedPaneId(paneId);
      syncLiveCacheDisplay(profileId, paneId, [...nextMinimized]);
    },
    [applyMinimizedPaneIds, setFocusedPaneId, syncLiveCacheDisplay],
  );

  /** Show only `paneId` in the main area (minimize all siblings). Used when adding a lone pane. */
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

  // Memoized so it only rebuilds when layout / minimized / focus actually change
  // references — a fresh tree every render would remount-reconcile every pane.
  const displayLayout = useMemo(
    () => (layout ? buildDisplayLayout(layout, minimizedPaneIds, focusedPaneId) : null),
    [layout, minimizedPaneIds, focusedPaneId],
  );

  return {
    activeProfile,
    restoring,
    isRestoring,
    migrationDone,
    activateProfile,
    restoreLastProfile,
    persistCurrentProfile: runPersist,
    flushPersistCurrentProfile,
    syncActiveProfile,
    remapProfileWorkspace,
    getProfileDefaultCwd,
    discardProfileSessions,
    getProfilePanes,
    getProfileFocusedPaneId,
    getProfileMinimizedPaneIds,
    hasLiveSessions,
    isPaneLive,
    canAddPane,
    maxPanes: MAX_GROUP_PANES,
    minimizedPaneIds,
    displayLayout,
    isPaneMinimized,
    focusPaneInDisplay,
    showPaneInDisplay,
    placePaneInDisplay,
    minimizePane,
    unminimizePanes,
    forgetMinimizedPane,
  };
}

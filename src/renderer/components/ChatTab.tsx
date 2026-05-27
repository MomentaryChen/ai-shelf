import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ProviderEntry, ProfileInfo } from "../types";
import { ToolLogo } from "./ToolLogo";
import { toolLabel } from "../utils";
import { AuthBadge } from "./Badge";
import { EmbeddedTerminal } from "./EmbeddedTerminal";
import { ProfileSidebar } from "./ProfileSidebar";
import { SplitPaneLayout } from "./SplitPaneLayout";
import { ResizeDivider } from "./ResizeDivider";
import { SidebarIconBtn, SidebarPanelChevron } from "./ProfileSidebarUI";
import { useProfileWorkspace } from "../hooks/useProfileWorkspace";
import { usePaneShortcuts } from "../hooks/usePaneShortcuts";
import { clearTerminalSession } from "../terminal/terminal-session-actions";
import {
  formatFocusPaneBinding,
  formatPaneKeyChord,
} from "../terminal/pane-key-bindings";
import {
  collectPanes,
  findPane,
  mapPanesInTree,
  removePaneFromTree,
  movePaneInTree,
  splitPaneInTree,
  updateSplitRatio,
  type LayoutNode,
  type PaneInfo,
  type SplitDirection,
} from "../terminal/split-tree";
import { normalizePaneTitle, paneDisplayLabel } from "../utils/pane-label";
import { hitPaneDropZone } from "../terminal/pane-drop-zone";
import type { PaneDropZone } from "../terminal/pane-drop-zone";
import {
  hasProfilePaneDrag,
  readProfilePaneDrag,
  visiblePanes,
} from "../terminal/profile-pane-display";
import { applyAppTheme, getChromeCssVar, useAppThemeRevision } from "../app-theme";
import {
  TERMINAL_OPTIONS,
  getAppBg,
  bumpDirHistory,
  loadSettings,
  saveSettings,
  type ChatSettings,
  type ExternalTerminal,
  SETTINGS_KEY,
} from "../chat-settings";
import { resolveLaunchTool, toolIdsFromInventory } from "../utils/available-tools";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

const TERMINAL_LABEL_KEYS: Record<ExternalTerminal, MessageKey> = {
  auto: "terminal.auto",
  wt: "terminal.wt",
  pwsh: "terminal.pwsh",
  powershell: "terminal.powershell",
  cmd: "terminal.cmd",
};

const SIDEBAR_WIDTH_KEY = "ai-inventory-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "ai-inventory-sidebar-collapsed";
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 440;

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = raw ? Number(raw) : 268;
    if (!Number.isFinite(n)) return 268;
    return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
  } catch {
    return 268;
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  claude: "Anthropic coding agent — context-rich, file-aware sessions",
  copilot: "GitHub Copilot CLI — explain, suggest and chat",
  cursor: "Cursor agent — AI pair programmer for your workspace",
  codex: "OpenAI Codex CLI — read, edit, and run code locally",
  gemini: "Google Gemini CLI — large-context terminal coding agent",
  aider: "Aider — git-aware pair programming with diff edits",
  opencode: "OpenCode — multi-provider terminal coding agent",
};

export function ChatTab({
  data,
  active = true,
  inventoryScanning = false,
}: {
  data: ProviderEntry[];
  active?: boolean;
  inventoryScanning?: boolean;
}) {
  const { t } = useLocale();
  const [layout, setLayout] = useState<LayoutNode | null>(null);
  const layoutRef = useRef<LayoutNode | null>(null);
  layoutRef.current = layout;
  const respawningPaneIdsRef = useRef(new Set<string>());
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [broadcastInput, setBroadcastInput] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [addingTerminal, setAddingTerminal] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [displayDropActive, setDisplayDropActive] = useState(false);
  const [profileSidebarDrag, setProfileSidebarDrag] = useState(false);
  useAppThemeRevision();
  const newMenuRef = useRef<HTMLDivElement>(null);
  const initialRestoreDoneRef = useRef(false);
  const restoreInFlightRef = useRef(false);

  const panes = layout ? collectPanes(layout) : [];
  const paneShortcutLabels = useMemo(() => {
    const b = settings.paneShortcuts;
    return {
      focusNext: formatPaneKeyChord(b.focusNext),
      focusPrev: formatPaneKeyChord(b.focusPrev),
      splitRight: formatPaneKeyChord(b.splitHorizontal),
      splitDown: formatPaneKeyChord(b.splitVertical),
      focusPane: formatFocusPaneBinding(b.focusPane),
    };
  }, [settings.paneShortcuts]);
  const bg = settings.terminalBg || getAppBg();
  const terminalFontFamily = settings.terminalFontFamily;
  const terminalFontSize = settings.terminalFontSize;
  const terminalScrollback = settings.terminalScrollback;
  const availableTools = useMemo(() => toolIdsFromInventory(data), [data]);

  const spawnPane = useCallback(async (tool: string, cwd: string): Promise<PaneInfo | null> => {
    const result = await window.api.ptySpawn(tool, cwd || undefined);
    if (!result.success || !result.sessionId) {
      const msg = result.error ?? "unknown error";
      console.error("[pty-spawn]", tool, msg);
      setTerminalError(t("chat.err.startFailed", { tool, msg }));
      return null;
    }
    setTerminalError(null);
    return { id: result.sessionId, tool, sessionId: result.sessionId, cwd: cwd || "" };
  }, []);

  const spawnPaneResilient = useCallback(
    async (tool: string, cwd: string): Promise<PaneInfo | null> => {
      const order = [tool, ...(tool !== "shell" ? ["shell"] : [])];
      for (const t of order) {
        const pane = await spawnPane(t, cwd);
        if (pane) return pane;
      }
      return spawnPane("shell", cwd);
    },
    [spawnPane],
  );

  const {
    activeProfile,
    restoring,
    migrationDone,
    activateProfile,
    restoreLastProfile,
    discardProfileSessions,
    syncActiveProfile,
    getProfileDefaultCwd,
    getProfilePanes,
    getProfileFocusedPaneId,
    canAddPane,
    maxPanes,
    minimizedPaneIds,
    displayLayout,
    isPaneMinimized,
    showPaneInDisplay,
    placePaneInDisplay,
    minimizePane,
    unminimizePanes,
    forgetMinimizedPane,
  } = useProfileWorkspace(
    layout,
    setLayout,
    focusedPaneId,
    setFocusedPaneId,
    spawnPaneResilient,
    settings.workingDir,
    broadcastInput,
  );

  const updateSettings = useCallback((partial: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const recordDirHistory = useCallback(
    (dir: string) => {
      const d = dir.trim();
      if (!d) return;
      setSettings((prev) => {
        const next = {
          ...prev,
          workingDir: d,
          dirHistory: bumpDirHistory(prev.dirHistory, d),
        };
        saveSettings(next);
        return next;
      });
    },
    [],
  );

  const panesRef = useRef(panes);
  panesRef.current = panes;

  const handlePtyWrite = useCallback(
    (data: string, sessionId: string) => {
      const current = panesRef.current;
      if (broadcastInput && current.length > 1) {
        for (const p of current) window.api.ptyWrite(p.sessionId, data);
      } else {
        window.api.ptyWrite(sessionId, data);
      }
    },
    [broadcastInput],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) {
        const next = loadSettings();
        setSettings(next);
        applyAppTheme(next.appTheme);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onDragEnd = () => setProfileSidebarDrag(false);
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);

  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

  useEffect(() => {
    if (!migrationDone || initialRestoreDoneRef.current || restoreInFlightRef.current) return;

    let cancelled = false;
    restoreInFlightRef.current = true;
    void (async () => {
      try {
        const r = await window.api.profileGetTree();
        if (cancelled || !r.success || !r.tree) return;
        const result = await restoreLastProfile(r.tree);
        if (cancelled) return;
        if (result?.cwd) updateSettings({ workingDir: result.cwd });
        if (result?.broadcastInput !== undefined) setBroadcastInput(result.broadcastInput);
      } catch (err) {
        console.error("[profile-restore]", err);
      } finally {
        restoreInFlightRef.current = false;
        if (!cancelled) initialRestoreDoneRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [migrationDone, restoreLastProfile, updateSettings]);

  const resolveCwd = useCallback(
    (override?: string) => {
      if (override?.trim()) return override.trim();
      const fromProfile = getProfileDefaultCwd();
      if (fromProfile) return fromProfile;
      if (settings.workingDir?.trim()) return settings.workingDir.trim();
      return "";
    },
    [settings.workingDir, getProfileDefaultCwd],
  );

  const addPane = useCallback(
    async (
      tool: string,
      cwd?: string,
      splitTargetId?: string,
      direction: SplitDirection = "horizontal",
      opts?: { keepOthersVisible?: boolean },
    ): Promise<PaneInfo | null> => {
      if (restoring) {
        setTerminalError(t("chat.err.restoringWait"));
        return null;
      }
      if (!canAddPane) {
        setTerminalError(t("chat.err.maxPanes", { max: maxPanes }));
        return null;
      }
      if (!window.api?.ptySpawn) {
        setTerminalError(t("chat.err.apiNotReady"));
        return null;
      }

      const pane = await spawnPaneResilient(tool || "shell", resolveCwd(cwd));
      if (!pane) return null;

      setLayout((prev) => {
        if (!prev) return { kind: "pane", pane };
        const targetId = splitTargetId ?? focusedPaneId ?? collectPanes(prev)[0]?.id;
        if (!targetId) return { kind: "pane", pane };
        return splitPaneInTree(prev, targetId, direction, pane);
      });
      setFocusedPaneId(pane.id);
      if (activeProfile) {
        if (opts?.keepOthersVisible && splitTargetId) {
          unminimizePanes(activeProfile.id, [pane.id, splitTargetId]);
        } else {
          showPaneInDisplay(activeProfile.id, pane.id);
        }
      }
      return pane;
    },
    [
      canAddPane,
      maxPanes,
      restoring,
      resolveCwd,
      spawnPaneResilient,
      focusedPaneId,
      activeProfile,
      showPaneInDisplay,
      unminimizePanes,
    ],
  );

  const respawnPaneWithCwd = useCallback(
    async (paneId: string, cwdOverride?: string): Promise<boolean> => {
      const layoutNow = layoutRef.current;
      const victim = layoutNow ? findPane(layoutNow, paneId) : null;
      if (!victim) return false;
      const cwd = cwdOverride?.trim() || victim.cwd || resolveCwd();
      if (respawningPaneIdsRef.current.has(paneId)) return false;
      respawningPaneIdsRef.current.add(paneId);
      const title = victim.title;
      const tool = victim.tool;
      try {
        window.api.ptyKill(victim.sessionId);
        const next = await spawnPaneResilient(tool, cwd);
        if (!next) {
          setTerminalError(
            (prev) =>
              prev ?? t("chat.err.sessionDead", { tool }),
          );
          return false;
        }
        setTerminalError(null);
        setLayout((prev) =>
          prev
            ? mapPanesInTree(prev, (p) =>
                p.id === paneId
                  ? { ...next, id: paneId, cwd, title }
                  : p,
              )
            : prev,
        );
        setFocusedPaneId(paneId);
        return true;
      } finally {
        respawningPaneIdsRef.current.delete(paneId);
      }
    },
    [spawnPaneResilient, resolveCwd, t],
  );

  const respawnPane = useCallback(
    async (paneId: string) => {
      if (respawningPaneIdsRef.current.has(paneId)) return;
      const layoutNow = layoutRef.current;
      const victim = layoutNow ? findPane(layoutNow, paneId) : null;
      if (!victim) return;
      respawningPaneIdsRef.current.add(paneId);
      const title = victim.title;
      const cwd = victim.cwd || resolveCwd();
      const tool = victim.tool;
      try {
        window.api.ptyKill(victim.sessionId);
        const next = await spawnPaneResilient(tool, cwd);
        if (!next) {
          setTerminalError(
            (prev) =>
              prev ?? t("chat.err.sessionDead", { tool }),
          );
          return;
        }
        setTerminalError(null);
        setLayout((prev) =>
          prev
            ? mapPanesInTree(prev, (p) =>
                p.id === paneId
                  ? { ...next, id: paneId, cwd: cwd || next.cwd, title }
                  : p,
              )
            : prev,
        );
      } finally {
        respawningPaneIdsRef.current.delete(paneId);
      }
    },
    [spawnPaneResilient, resolveCwd, t],
  );

  const renamePane = useCallback((paneId: string, title: string) => {
    const normalized = normalizePaneTitle(title);
    setLayout((prev) =>
      prev
        ? mapPanesInTree(prev, (p) =>
            p.id === paneId ? { ...p, title: normalized } : p,
          )
        : prev,
    );
  }, []);

  const changePaneCwd = useCallback(
    async (paneId: string) => {
      const layoutNow = layoutRef.current;
      const pane = layoutNow ? findPane(layoutNow, paneId) : null;
      if (!pane) return;
      const picked = await window.api.pickFolder(pane.cwd || resolveCwd() || undefined);
      if (!picked) return;
      const ok = await respawnPaneWithCwd(paneId, picked);
      if (ok) recordDirHistory(picked);
    },
    [resolveCwd, recordDirHistory, respawnPaneWithCwd],
  );

  const openFolderPane = useCallback(
    async (cwdHint?: string) => {
      if (restoring) {
        setTerminalError(t("chat.err.restoringWait"));
        return;
      }
      if (!canAddPane) {
        setTerminalError(t("chat.err.maxPanes", { max: maxPanes }));
        return;
      }
      const picked = await window.api.pickFolder(cwdHint?.trim() || resolveCwd() || undefined);
      if (!picked) return;
      recordDirHistory(picked);
      const tool = resolveLaunchTool(
        activeProfile?.defaultTool ?? availableTools[0],
        availableTools,
      );
      const created = await addPane(tool, picked);
      if (!created) {
        setTerminalError((prev) => prev ?? t("chat.err.cannotOpen"));
      }
    },
    [
      restoring,
      canAddPane,
      maxPanes,
      resolveCwd,
      recordDirHistory,
      activeProfile?.defaultTool,
      availableTools,
      addPane,
    ],
  );

  const clearPaneScreen = useCallback(
    (paneId: string) => {
      const pane = layout ? findPane(layout, paneId) : null;
      if (!pane) return;
      clearTerminalSession(pane.sessionId);
    },
    [layout],
  );

  const closePane = useCallback(
    (paneId: string) => {
      if (activeProfile) forgetMinimizedPane(activeProfile.id, paneId);
      setLayout((prev) => {
        if (prev) {
          const victim = collectPanes(prev).find((p) => p.id === paneId);
          if (victim) window.api.ptyKill(victim.sessionId);
        }
        return removePaneFromTree(prev, paneId);
      });
      setFocusedPaneId((prev) => (prev === paneId ? null : prev));
    },
    [activeProfile, forgetMinimizedPane],
  );

  const splitPane = useCallback(
    async (paneId: string, direction: SplitDirection) => {
      if (!canAddPane) return;
      const parent = layout ? collectPanes(layout).find((p) => p.id === paneId) : null;
      const tool = resolveLaunchTool(
        parent?.tool ?? availableTools[0],
        availableTools,
      );
      await addPane(tool, parent?.cwd || resolveCwd(), paneId, direction, {
        keepOthersVisible: true,
      });
    },
    [layout, availableTools, addPane, canAddPane, resolveCwd],
  );

  usePaneShortcuts({
    panes,
    focusedPaneId,
    enabled: active && layout !== null && !profileBusy && !restoring,
    onFocusPane: setFocusedPaneId,
    onClosePane: closePane,
    onClearPane: clearPaneScreen,
    onRestartPane: (id) => void respawnPane(id),
    onSplitPane: (id, dir) => void splitPane(id, dir),
  });

  async function handleActivateProfile(profile: ProfileInfo) {
    setProfileBusy(true);
    setTerminalError(null);
    try {
      const r = await activateProfile(profile);
      if (r?.cwd) updateSettings({ workingDir: r.cwd });
      if (r?.broadcastInput !== undefined) setBroadcastInput(r.broadcastInput);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTerminalError(t("chat.err.enableProfile", { msg }));
      return undefined;
    } finally {
      setProfileBusy(false);
    }
  }

  const handleActivateProfileRef = useRef(handleActivateProfile);
  handleActivateProfileRef.current = handleActivateProfile;

  useEffect(() => {
    const unsub = window.api.onTrayActivateProfile((profileId) => {
      void (async () => {
        const r = await window.api.profileGetTree();
        const profile = r.tree?.profiles.find((p) => p.id === profileId);
        if (profile) await handleActivateProfileRef.current(profile);
      })();
    });
    return unsub;
  }, []);

  async function restorePaneToDisplay(profile: ProfileInfo, paneId: string) {
    if (activeProfile?.id !== profile.id) {
      await handleActivateProfile(profile);
    }
    showPaneInDisplay(profile.id, paneId);
  }

  async function restorePaneToDisplayById(
    profileId: string,
    paneId: string,
    opts?: { targetPaneId?: string; zone?: PaneDropZone },
  ) {
    if (activeProfile?.id !== profileId) {
      const r = await window.api.profileGetTree();
      const profile = r.tree?.profiles.find((p) => p.id === profileId);
      if (!profile) return;
      await handleActivateProfile(profile);
    }
    if (opts?.targetPaneId && opts.zone) {
      placePaneInDisplay(profileId, paneId, opts.targetPaneId, opts.zone);
      return;
    }
    showPaneInDisplay(profileId, paneId);
  }

  async function placePaneBeside(
    profile: ProfileInfo,
    dragPaneId: string,
    targetPaneId: string,
    zone: PaneDropZone,
  ) {
    if (activeProfile?.id !== profile.id) {
      await handleActivateProfile(profile);
    }
    placePaneInDisplay(profile.id, dragPaneId, targetPaneId, zone);
  }

  function handleDisplayDragOver(e: React.DragEvent) {
    if (!hasProfilePaneDrag(e.dataTransfer)) return;
    // Do not stopPropagation — pane shells must receive dragover for zone targeting.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (e.target === e.currentTarget) setDisplayDropActive(true);
  }

  function handleDisplayDrop(e: React.DragEvent) {
    if (!hasProfilePaneDrag(e.dataTransfer)) return;
    if (e.target !== e.currentTarget) return;
    const payload = readProfilePaneDrag(e.dataTransfer);
    if (!payload) return;
    e.preventDefault();
    setDisplayDropActive(false);

    const visible =
      layout && activeProfile?.id === payload.profileId
        ? visiblePanes(layout, minimizedPaneIds)
        : [];
    const anchor = visible.find((p) => p.id !== payload.paneId);

    if (anchor && visible.length >= 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      let zone = hitPaneDropZone(e.clientX, e.clientY, rect);
      if (zone === "swap") zone = "right";
      void restorePaneToDisplayById(payload.profileId, payload.paneId, {
        targetPaneId: anchor.id,
        zone,
      });
      return;
    }

    void restorePaneToDisplayById(payload.profileId, payload.paneId);
  }

  async function handleNewTerminal(profile: ProfileInfo) {
    if (addingTerminal || profileBusy || restoring) return;
    setAddingTerminal(true);
    setTerminalError(null);
    try {
      if (activeProfile?.id !== profile.id) {
        await handleActivateProfile(profile);
      }
      const cwd =
        profile.id === activeProfile?.id
          ? getProfileDefaultCwd() || profile.defaultCwd?.trim()
          : profile.defaultCwd?.trim();
      const created = await addPane(
        resolveLaunchTool(profile.defaultTool, availableTools),
        cwd || undefined,
      );
      if (!created) {
        setTerminalError((prev) => prev ?? t("chat.err.cannotOpen"));
      }
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingTerminal(false);
    }
  }

  async function handleToggleBroadcast(profileId: string, enabled: boolean) {
    if (activeProfile?.id === profileId) setBroadcastInput(enabled);
    await window.api.profileUpdate(profileId, { broadcastInput: enabled });
  }

  async function openExternal(tool: string): Promise<{ success: boolean; error?: string }> {
    return window.api.launchInTerminal(
      tool,
      settings.externalTerminal,
      resolveCwd() || undefined,
    );
  }

  const profileLabel = activeProfile?.name ?? null;

  function handleProfileDeleted(profileId: string) {
    discardProfileSessions(profileId);
    if (activeProfile?.id !== profileId) return;
    setLayout(null);
    setFocusedPaneId(null);
    setBroadcastInput(false);
  }

  const sidebar = (
    <ProfileSidebar
      width={sidebarWidth}
      activeProfileId={activeProfile?.id ?? null}
      focusedPaneId={focusedPaneId}
      getProfilePanes={getProfilePanes}
      getProfileFocusedPaneId={getProfileFocusedPaneId}
      broadcastInput={broadcastInput}
      availableTools={availableTools}
      inventoryScanning={inventoryScanning}
      busy={profileBusy || restoring}
      onActivateProfile={(p) => void handleActivateProfile(p)}
      onSelectPane={(profile, paneId) => {
        void restorePaneToDisplay(profile, paneId);
      }}
      onRestorePane={(profile, paneId) => {
        void restorePaneToDisplay(profile, paneId);
      }}
      onPlacePaneBeside={(profile, dragPaneId, targetPaneId, zone) => {
        void placePaneBeside(profile, dragPaneId, targetPaneId, zone);
      }}
      onMinimizePane={(profileId, paneId) => minimizePane(profileId, paneId)}
      isPaneMinimized={isPaneMinimized}
      onClosePane={(_profileId, paneId) => closePane(paneId)}
      onRenamePane={(_profileId, paneId, title) => renamePane(paneId, title)}
      onMovePane={(_profileId, dragPaneId, targetPaneId, zone) => {
        setLayout((prev) => (prev ? movePaneInTree(prev, dragPaneId, targetPaneId, zone) : prev));
      }}
      onAddTerminal={(profile) => void handleNewTerminal(profile)}
      onOpenFolder={(profile) => {
        void (async () => {
          if (activeProfile?.id !== profile.id) {
            await handleActivateProfile(profile);
          }
          const hint =
            profile.defaultCwd?.trim() ||
            getProfileDefaultCwd() ||
            settings.workingDir?.trim() ||
            undefined;
          await openFolderPane(hint);
        })();
      }}
      addingTerminal={addingTerminal}
      onToggleBroadcast={(id, v) => void handleToggleBroadcast(id, v)}
      onProfileUpdated={(profile) => {
        syncActiveProfile(profile);
        if (profile.id === activeProfile?.id) {
          updateSettings({ workingDir: profile.defaultCwd?.trim() ?? "" });
        }
      }}
      onProfileDeleted={handleProfileDeleted}
      activeLivePaneCount={panes.length}
      onProfilePaneDragChange={setProfileSidebarDrag}
      onCollapse={() => setSidebarCollapsed(true)}
    />
  );

  const topBar = (
    <WarpTopBar
      profileLabel={profileLabel}
      profileAccentColor={activeProfile?.accentColor ?? null}
      paneCount={panes.length}
      maxPanes={maxPanes}
      canAddPane={canAddPane}
      broadcastInput={broadcastInput}
      restoring={profileBusy || restoring}
      externalTerminal={settings.externalTerminal}
      onExternalTerminalChange={(v) => updateSettings({ externalTerminal: v })}
      newMenuRef={newMenuRef}
      showNewMenu={showNewMenu}
      onToggleNewMenu={() => setShowNewMenu((o) => !o)}
      onAddPane={(tool) => void addPane(tool)}
      onOpenFolder={() => void openFolderPane()}
      available={data.filter((e) => e.available)}
      splitShortcutLabels={{
        splitRight: paneShortcutLabels.splitRight,
        splitDown: paneShortcutLabels.splitDown,
      }}
    />
  );

  const terminalArea = layout ? (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden p-1.5 ${
        displayDropActive ? "ring-2 ring-inset ring-accent/40" : ""
      }`}
      onDragOver={handleDisplayDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDisplayDropActive(false);
        }
      }}
      onDrop={handleDisplayDrop}
    >
      <div className="flex min-h-0 flex-1 flex-col">
      {displayLayout ? (
      <SplitPaneLayout
        node={displayLayout}
        focusedPaneId={focusedPaneId}
        bg={bg}
        sidebarPaneDragActive={profileSidebarDrag}
        profileAccentColor={activeProfile?.accentColor ?? null}
        onFocusPane={setFocusedPaneId}
        onClosePane={closePane}
        onMinimizePane={(paneId) => {
          if (activeProfile) minimizePane(activeProfile.id, paneId);
        }}
        onRenamePane={renamePane}
        onSplitPane={(id, dir) => void splitPane(id, dir)}
        onPaneCwdClick={(paneId) => void changePaneCwd(paneId)}
        onResizeSplit={(splitId, ratio) =>
          setLayout((prev) => (prev ? updateSplitRatio(prev, splitId, ratio) : prev))
        }
        onMovePane={(dragPaneId, targetPaneId, zone) => {
          setLayout((prev) => (prev ? movePaneInTree(prev, dragPaneId, targetPaneId, zone) : prev));
        }}
        onProfilePaneDrop={(dragPaneId, targetPaneId, zone) => {
          if (!activeProfile) return;
          placePaneInDisplay(activeProfile.id, dragPaneId, targetPaneId, zone);
        }}
        renderTerminal={(pane, paneFocused) => (
          <EmbeddedTerminal
            key={pane.sessionId}
            sessionId={pane.sessionId}
            bg={bg}
            fontFamily={terminalFontFamily}
            fontSize={terminalFontSize}
            scrollback={terminalScrollback}
            rightClickPaste={settings.terminalRightClickPaste}
            active={active}
            focused={paneFocused}
            onWrite={handlePtyWrite}
            onSessionLost={() => {
              if (respawningPaneIdsRef.current.has(pane.id)) return;
              void respawnPane(pane.id);
            }}
            onRestart={() => void respawnPane(pane.id)}
            onExit={() => closePane(pane.id)}
          />
        )}
      />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-chrome-border-subtle px-4 py-6 text-center text-[12px] text-chrome-text-dim">
          <p>{t("chat.allTerminalsMinimized")}</p>
          <p className="text-[11px]">{t("chat.selectTerminalFromSidebar")}</p>
          {activeProfile && panes.some((p) => minimizedPaneIds.has(p.id)) && (
            <div className="flex max-w-md flex-col gap-1.5">
              {panes
                .filter((p) => minimizedPaneIds.has(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void restorePaneToDisplay(activeProfile, p.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-chrome-border-subtle bg-chrome-surface px-3 py-2 text-left text-[12px] text-chrome-text-secondary transition-colors hover:border-chrome-border-hover hover:bg-chrome-surface-menu hover:text-chrome-text"
                  >
                    <ToolLogo tool={p.tool} size={14} />
                    <span className="min-w-0 truncate">{paneDisplayLabel(p)}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-chrome-accent-text">
                      {t("profile.restoreToDisplay")}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  ) : (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 py-6">
      {activeProfile ? (
        <div className="rounded-lg border border-chrome-border-subtle bg-chrome-surface px-4 py-3 text-[13px] text-chrome-text-muted">
          Profile <span className="text-chrome-accent-text">{profileLabel}</span>
          {restoring || profileBusy ? (
            <span className="ml-2">{t("chat.restoring")}</span>
          ) : (
            <span className="ml-2">{t("chat.restorePaneHint", { max: maxPanes })}</span>
          )}
          {terminalError && (
            <p className="mt-2 text-[12px] text-red-400">{terminalError}</p>
          )}
          <p className="mt-2 text-[11px] text-chrome-text-dim">{t("chat.shortcutHint", paneShortcutLabels)}</p>
          <p className="mt-1 text-[11px] text-chrome-text-dim">{t("chat.debugHint")}</p>
        </div>
      ) : (
        <p className="text-[13px] text-chrome-text-subtle">{t("chat.pickProfile")}</p>

      )}
      <div>
        {availableTools.length > 0 && (
          <>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-chrome-text-subtle">
              {t("chat.availableAgents")}

            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.filter((e) => e.available).map((e) => (
                <ToolCard
                  key={e.tool}
                  entry={e}
                  onInApp={() => addPane(e.tool)}
                  onExternal={() => openExternal(e.tool)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-chrome-bg text-chrome-text">
      {sidebarCollapsed ? (
        <aside className="flex w-9 shrink-0 flex-col border-r border-chrome-border bg-gradient-to-b from-chrome-bg-top to-chrome-bg-bottom">
          <div className="flex h-9 shrink-0 items-center justify-center border-b border-chrome-border/80">
            <SidebarIconBtn
              title={t("sidebar.expand")}
              onClick={() => setSidebarCollapsed(false)}
            >
              <SidebarPanelChevron expanded={false} />
            </SidebarIconBtn>
          </div>
        </aside>
      ) : (
        <>
          {sidebar}
          <div
            className="w-2.5 shrink-0 self-stretch"
            style={{ width: 10 }}
          >
            <ResizeDivider
              mode="delta"
              orientation="horizontal"
              onResize={(delta) =>
                setSidebarWidth((w) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w + delta)))
              }
            />
          </div>
        </>
      )}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {topBar}
        {terminalError && (
          <div className="shrink-0 border-b border-red-500/30 bg-red-900/20 px-3 py-2 text-[12px] text-red-300">
            {terminalError}
          </div>
        )}
        {terminalArea}
      </div>
    </div>
  );
}

function WarpTopBar({
  profileLabel,
  profileAccentColor = null,
  paneCount,
  maxPanes,
  canAddPane,
  broadcastInput,
  restoring,
  externalTerminal,
  onExternalTerminalChange,
  newMenuRef,
  showNewMenu,
  onToggleNewMenu,
  onAddPane,
  onOpenFolder,
  available,
  splitShortcutLabels,
}: {
  profileLabel: string | null;
  profileAccentColor?: string | null;
  paneCount: number;
  maxPanes: number;
  canAddPane: boolean;
  broadcastInput: boolean;
  restoring: boolean;
  externalTerminal: ExternalTerminal;
  onExternalTerminalChange: (v: ExternalTerminal) => void;
  newMenuRef: React.RefObject<HTMLDivElement | null>;
  showNewMenu: boolean;
  onToggleNewMenu: () => void;
  onAddPane: (tool: string) => void;
  onOpenFolder: () => void;
  available: ProviderEntry[];
  splitShortcutLabels: { splitRight: string; splitDown: string };
}) {
  const { t } = useLocale();
  const accent = profileAccentColor;
  const hasAccent = Boolean(accent);
  const defaultAccent = getChromeCssVar("--color-chrome-accent-text", "#8ab4ff");

  return (
    <div className="relative z-20 flex h-10 shrink-0 items-center gap-2 overflow-visible border-b border-chrome-border bg-chrome-bg/95 px-3 backdrop-blur-sm">
      {profileLabel && (
        <div
          className="flex min-w-0 max-w-[280px] items-center gap-2 rounded-lg border px-2 py-1"
          style={
            hasAccent && accent
              ? {
                  backgroundColor: `${accent}12`,
                  borderColor: `${accent}30`,
                }
              : {
                  backgroundColor: `color-mix(in srgb, ${defaultAccent} 8%, transparent)`,
                  borderColor: `color-mix(in srgb, ${defaultAccent} 20%, transparent)`,
                }
          }
          title={profileLabel}
        >
          {hasAccent && (
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: accent!, boxShadow: `0 0 6px ${accent}88` }}
              aria-hidden
            />
          )}
          <span
            className="min-w-0 truncate text-[11px] font-medium"
            style={{ color: hasAccent && accent ? accent : defaultAccent }}
          >
            {profileLabel}
          </span>
          {paneCount > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-chrome-text-faint">
              {paneCount}/{maxPanes}
              {broadcastInput && paneCount > 1 ? ` · ${t("chat.syncLabel")}` : ""}
            </span>
          )}
        </div>
      )}
      {restoring && <span className="text-[11px] text-chrome-text-subtle">{t("chat.restoringShort")}</span>}

      <div ref={newMenuRef} className="relative ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={!canAddPane || restoring}
          onClick={onOpenFolder}
          title={canAddPane ? t("chat.pickFolderPane") : t("chat.maxPanesTitle", { max: maxPanes })}
          className="cursor-pointer rounded-md border border-chrome-border-strong px-2 py-1 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover disabled:opacity-40"

        >
          📁 {t("chat.folderBtn")}
        </button>
        <button
          type="button"
          disabled={!canAddPane}
          onClick={onToggleNewMenu}
          title={
            canAddPane
              ? t("chat.addPaneTitle", splitShortcutLabels)
              : t("chat.maxPanesTitle", { max: maxPanes })
          }
          className="cursor-pointer rounded-md border border-chrome-border-strong px-2.5 py-1 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover disabled:opacity-40"

        >
          {t("chat.addPane")}
        </button>
        {showNewMenu && canAddPane && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border border-chrome-border-strong bg-chrome-surface-raised py-1 shadow-xl">
            {available.map((e) => (
              <button
                key={e.tool}
                type="button"
                onClick={() => {
                  onAddPane(e.tool);
                  onToggleNewMenu();
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-[12px] hover:bg-chrome-surface-hover-strong"
              >
                <ToolLogo tool={e.tool} size={14} />
                {toolLabel(e.tool)}
              </button>
            ))}
          </div>
        )}
        <TerminalSelector value={externalTerminal} onChange={onExternalTerminalChange} />
      </div>
    </div>
  );
}

function ToolCard({
  entry,
  disabled = false,
  onInApp,
  onExternal,
}: {
  entry: ProviderEntry;
  disabled?: boolean;
  onInApp?: () => void;
  onExternal?: () => Promise<{ success: boolean; error?: string }>;
}) {
  const { t } = useLocale();
  const [extBusy, setExtBusy] = useState(false);
  const [inAppBusy, setInAppBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleExternal() {
    if (!onExternal) return;
    setExtBusy(true);
    setErr("");
    const r = await onExternal();
    setExtBusy(false);
    if (!r.success) setErr(r.error ?? t("chat.launchFailed"));
  }

  async function handleInApp() {
    setInAppBusy(true);
    setErr("");
    await onInApp?.();
    setInAppBusy(false);
  }

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border p-6 transition-colors ${
        disabled
          ? "border-chrome-border-subtle bg-chrome-surface opacity-50"
          : "border-chrome-border-subtle bg-chrome-surface-raised hover:border-chrome-border-hover"
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-chrome-border-strong bg-chrome-bg">
          <ToolLogo tool={entry.tool} size={28} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{toolLabel(entry.tool)}</span>
            {entry.version && <span className="text-[11px] text-chrome-text-subtle">v{entry.version}</span>}
          </div>
          <AuthBadge auth={disabled ? "missing" : entry.auth} />
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-chrome-text-muted">
        {TOOL_DESCRIPTIONS[entry.tool] ?? t("chat.aiAssistant")}
      </p>
      {err && <p className="rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{err}</p>}
      {disabled ? (
        <p className="text-center text-[13px] text-chrome-text-subtle">{t("chat.notInstalled")}</p>

      ) : (
        <div className="mt-auto grid grid-cols-2 gap-3">
          <button
            disabled={extBusy}
            onClick={handleExternal}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-chrome-border-strong py-2.5 text-[13px] disabled:opacity-50"
          >
            {extBusy ? <span className="animate-spin">⟳</span> : "🖥️"} {t("chat.externalBtn")}
          </button>
          <button
            disabled={inAppBusy}
            onClick={handleInApp}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-accent/50 bg-accent/15 py-2.5 text-[13px] font-medium text-accent disabled:opacity-50"
          >
            {inAppBusy ? <span className="animate-spin">⟳</span> : "⌨️"} {t("chat.inAppBtn")}
          </button>
        </div>
      )}
    </div>
  );
}

function TerminalSelector({
  value,
  onChange,
}: {
  value: ExternalTerminal;
  onChange: (v: ExternalTerminal) => void;
}) {
  const { t } = useLocale();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ExternalTerminal)}
      className="cursor-pointer rounded-md border border-chrome-border-strong bg-chrome-surface px-2 py-1 text-[12px] focus:outline-none"
    >
      {TERMINAL_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {t(TERMINAL_LABEL_KEYS[o.value])}
        </option>
      ))}
    </select>
  );
}

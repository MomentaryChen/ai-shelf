import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { Monitor, Terminal, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProfileForest, ProviderEntry, ProfileInfo } from "../types";
import { ToolLogo } from "./ToolLogo";
import { EmptyState } from "./EmptyState";
import { toolLabel } from "../utils";
import { AuthBadge } from "./Badge";
import { EmbeddedTerminal } from "./EmbeddedTerminal";
import { TerminalStatusBar } from "./TerminalStatusBar";
import { Sidebar } from "./Sidebar";
import { ProfileCreateDialog } from "./ProfileCreateDialog";
import { ProfileGroupNameDialog } from "./ProfileGroupNameDialog";
import { ProfileSettingsDialog, type ProfileSettingsPatch } from "./ProfileSettingsDialog";
import { SplitPaneLayout } from "./SplitPaneLayout";
import { ResizeDivider } from "./ResizeDivider";
import { useProfileWorkspace } from "../hooks/useProfileWorkspace";
import { usePaneAgentAwareness } from "../hooks/usePaneAgentAwareness";
import { usePaneShortcuts } from "../hooks/usePaneShortcuts";
import { useProfileQuickSwitch } from "../hooks/useProfileQuickSwitch";
import { formatProfileQuickSwitchLabels } from "../profile-quick-switch";
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
import { applyAppTheme, useAppThemeRevision } from "../app-theme";
import {
  profileAccentMarkerStyle,
  profileTopBarBadgeStyle,
  profileTopBarLabelStyle,
} from "../utils/profile-colors";
import {
  TERMINAL_OPTIONS,
  getAppBg,
  isAppThemeTerminalBg,
  bumpDirHistory,
  loadSettings,
  saveSettings,
  subscribeSettingsChanges,
  type ChatSettings,
  type ExternalTerminal,
} from "../chat-settings";
import { resolveToolLaunchExtraArgs } from "../../tool-launch.js";
import {
  PLAIN_SHELL_TOOL_ID,
  profileToolLabel,
  resolveLaunchTool,
  toolIdsFromInventory,
} from "../utils/available-tools";
import { reorderById } from "../utils/reorder-by-id";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import type { Command } from "./CommandPalette";
import { useTerminalCommands } from "../hooks/useTerminalCommands";

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

/** Ignore model-enrichment churn when deciding if terminal chrome needs a re-render. */
function inventoryTerminalFingerprint(data: ProviderEntry[]): string {
  return data.map((e) => `${e.tool}:${e.available ? 1 : 0}`).join("|");
}

function ChatTabInner({
  data,
  active = true,
  inventoryScanning = false,
  onRegisterCommands,
}: {
  data: ProviderEntry[];
  active?: boolean;
  inventoryScanning?: boolean;
  onRegisterCommands?: (commands: Command[]) => void;
}) {
  const { t } = useLocale();
  const [layout, setLayout] = useState<LayoutNode | null>(null);
  const layoutRef = useRef<LayoutNode | null>(null);
  layoutRef.current = layout;
  const respawningPaneIdsRef = useRef(new Set<string>());
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [broadcastInput, setBroadcastInput] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [addingTerminal, setAddingTerminal] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [sidebarForest, setSidebarForest] = useState<ProfileForest | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [settingsProfileId, setSettingsProfileId] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [displayDropActive, setDisplayDropActive] = useState(false);
  const [profileSidebarDrag, setProfileSidebarDrag] = useState(false);
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  useAppThemeRevision();
  const initialRestoreDoneRef = useRef(false);
  const restoreInFlightRef = useRef(false);

  const panes = layout ? collectPanes(layout) : [];
  const focusedPane = focusedPaneId ? (panes.find((p) => p.id === focusedPaneId) ?? null) : null;

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const { paneAgentStates, recordPaneAgentInput } = usePaneAgentAwareness(
    panes,
    focusedPaneId,
    settings,
    t,
    windowFocused,
  );
  const paneShortcutLabels = useMemo(() => {
    const b = settings.paneShortcuts;
    const profile = formatProfileQuickSwitchLabels();
    return {
      focusNext: formatPaneKeyChord(b.focusNext),
      focusPrev: formatPaneKeyChord(b.focusPrev),
      splitRight: formatPaneKeyChord(b.splitHorizontal),
      splitDown: formatPaneKeyChord(b.splitVertical),
      focusPane: formatFocusPaneBinding(b.focusPane),
      profileByIndex: profile.profileByIndex,
      profileCycle: profile.profileCycle,
      profileCyclePrev: profile.profileCyclePrev,
    };
  }, [settings.paneShortcuts]);
  const useAppThemeBg = isAppThemeTerminalBg(settings.terminalBg);
  const bg = useAppThemeBg ? getAppBg() : settings.terminalBg;
  const terminalFontFamily = settings.terminalFontFamily;
  const terminalFontSize = settings.terminalFontSize;
  const terminalScrollback = settings.terminalScrollback;
  const availableTools = useMemo(() => toolIdsFromInventory(data), [data]);

  const spawnPane = useCallback(async (tool: string, cwd: string): Promise<PaneInfo | null> => {
    const extraArgs = resolveToolLaunchExtraArgs(settings.toolLaunchArgs, tool);
    const result = await window.api.ptySpawn(tool, cwd || undefined, extraArgs);
    if (!result.success || !result.sessionId) {
      const msg = result.error ?? "unknown error";
      console.error("[pty-spawn]", tool, msg);
      setTerminalError(t("chat.err.startFailed", { tool, msg }));
      return null;
    }
    setTerminalError(null);
    return { id: result.sessionId, tool, sessionId: result.sessionId, cwd: cwd || "" };
  }, [settings.toolLaunchArgs, t]);

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
    isRestoring,
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
    focusPaneInDisplay,
    showPaneInDisplay,
    placePaneInDisplay,
    minimizePane,
    unminimizePanes,
    forgetMinimizedPane,
    persistCurrentProfile,
    flushPersistCurrentProfile,
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
        for (const p of current) {
          window.api.ptyWrite(p.sessionId, data);
          recordPaneAgentInput(p.sessionId);
        }
      } else {
        window.api.ptyWrite(sessionId, data);
        recordPaneAgentInput(sessionId);
      }
    },
    [broadcastInput, recordPaneAgentInput],
  );

  const broadcastActive = broadcastInput && panes.length > 1;

  // Palette "broadcast command" — always sends to every pane and presses Enter,
  // independent of the broadcast-input toggle (which only mirrors keystrokes).
  const broadcastCommandToPanes = useCallback((text: string) => {
    const current = panesRef.current;
    if (current.length === 0) return;
    const line = text.endsWith("\n") || text.endsWith("\r") ? text : `${text}\r`;
    for (const p of current) {
      window.api.ptyWrite(p.sessionId, line);
      recordPaneAgentInput(p.sessionId);
    }
  }, [recordPaneAgentInput]);

  useEffect(() => {
    return subscribeSettingsChanges(() => {
      const next = loadSettings();
      setSettings(next);
      applyAppTheme(next.appTheme);
    });
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

  const refreshSidebarForest = useCallback(async (preferredGroupId?: string | null) => {
    const r = await window.api.profileGroupGetForest();
    if (!r.success || !r.forest) return;
    setSidebarForest(r.forest);
    const preferred =
      (preferredGroupId &&
        r.forest.groups.some((g) => g.id === preferredGroupId) &&
        preferredGroupId) ||
      (activeProfile?.workspaceId &&
        r.forest.groups.some((g) => g.id === activeProfile.workspaceId) &&
        activeProfile.workspaceId) ||
      r.forest.lastActiveGroupId ||
      r.forest.groups[0]?.id ||
      null;
    setSelectedGroupId(preferred);
  }, [activeProfile?.workspaceId]);

  useEffect(() => {
    void refreshSidebarForest();
  }, [refreshSidebarForest, activeProfile?.id, panes.length]);

  useEffect(() => {
    const unsub = window.api.onSyncDataApplied(() => {
      void refreshSidebarForest();
    });
    return unsub;
  }, [refreshSidebarForest]);

  useEffect(() => {
    const onDragEnd = () => setProfileSidebarDrag(false);
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);


  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const hasMod = ev.ctrlKey || ev.metaKey;
      if (!hasMod || ev.shiftKey || ev.altKey) return;
      if (ev.key.toLowerCase() !== "s") return;

      const target = ev.target as HTMLElement | null;
      // xterm uses a hidden textarea; still allow sidebar toggle (same as pane shortcuts).
      if (target && !target.closest(".xterm")) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest("[contenteditable='true']")
        ) {
          return;
        }
      }

      ev.preventDefault();
      ev.stopImmediatePropagation();
      setSidebarCollapsed((prev) => !prev);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    if (!migrationDone || initialRestoreDoneRef.current || restoreInFlightRef.current) return;

    let cancelled = false;
    restoreInFlightRef.current = true;
    void (async () => {
      try {
        const r = await window.api.profileGroupGetForest();
        if (cancelled || !r.success || !r.forest) return;
        const result = await restoreLastProfile(r.forest);
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

  useEffect(() => {
    const unsub = window.api.onProfileLayoutFlush(() => {
      void flushPersistCurrentProfile().finally(() => {
        window.api.sendProfileLayoutFlushDone();
      });
    });
    return unsub;
  }, [flushPersistCurrentProfile]);

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
      if (isRestoring()) {
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
      isRestoring,
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
      if (isRestoring()) {
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
      isRestoring,
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
        const r = await window.api.profileGroupGetForest();
        if (!r.success || !r.forest) return;
        let profile: import("../types").ProfileInfo | undefined;
        for (const g of r.forest.groups) {
          profile = g.profiles.find((p) => p.id === profileId);
          if (profile) break;
        }
        if (profile) await handleActivateProfileRef.current(profile);
      })();
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.api.onPaneAgentFocus((paneId) => {
      if (activeProfile) focusPaneInDisplay(activeProfile.id, paneId);
      else setFocusedPaneId(paneId);
    });
    return unsub;
  }, [activeProfile, focusPaneInDisplay]);

  async function restorePaneToDisplay(profile: ProfileInfo, paneId: string) {
    if (activeProfile?.id !== profile.id) {
      await handleActivateProfile(profile);
    }
    focusPaneInDisplay(profile.id, paneId);
  }

  async function restorePaneToDisplayById(
    profileId: string,
    paneId: string,
    opts?: { targetPaneId?: string; zone?: PaneDropZone },
  ) {
    if (activeProfile?.id !== profileId) {
      const r = await window.api.profileGroupGetForest();
      if (!r.success || !r.forest) return;
      let profile: import("../types").ProfileInfo | undefined;
      for (const g of r.forest.groups) {
        profile = g.profiles.find((p) => p.id === profileId);
        if (profile) break;
      }
      if (!profile) return;
      await handleActivateProfile(profile);
    }
    if (opts?.targetPaneId && opts.zone) {
      placePaneInDisplay(profileId, paneId, opts.targetPaneId, opts.zone);
      return;
    }
    focusPaneInDisplay(profileId, paneId);
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
    if (addingTerminal || profileBusy || isRestoring()) return;
    setAddingTerminal(true);
    setTerminalError(null);
    try {
      if (activeProfile?.id !== profile.id) {
        await handleActivateProfile(profile);
      }
      const cwd = profile.defaultCwd?.trim() || getProfileDefaultCwd() || undefined;
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

  const openExternal = useCallback(
    async (tool: string): Promise<{ success: boolean; error?: string }> => {
      const extraArgs = resolveToolLaunchExtraArgs(settings.toolLaunchArgs, tool);
      return window.api.launchInTerminal(
        tool,
        settings.externalTerminal,
        resolveCwd() || undefined,
        extraArgs,
      );
    },
    [settings.toolLaunchArgs, settings.externalTerminal, resolveCwd],
  );

  const paletteActions = useMemo(
    () => ({
      addPane: (tool: string) => void addPane(tool),
      openExternal: (tool: string) => void openExternal(tool),
      activateProfile: (profileId: string) => {
        const profile = sidebarForest?.groups
          .flatMap((g) => g.profiles)
          .find((p) => p.id === profileId);
        if (profile) void handleActivateProfileRef.current(profile);
      },
      broadcastCommand: broadcastCommandToPanes,
    }),
    [addPane, openExternal, sidebarForest, broadcastCommandToPanes],
  );

  // Group used to map Ctrl+1–9 shortcut hints in the palette (mirrors currentGroupId below).
  const paletteGroupId =
    selectedGroupId ??
    activeProfile?.workspaceId ??
    sidebarForest?.lastActiveGroupId ??
    sidebarForest?.groups[0]?.id ??
    null;

  const terminalCommands = useTerminalCommands(
    t,
    data,
    sidebarForest,
    activeProfile?.id ?? null,
    { currentGroupId: paletteGroupId, paneCount: panes.length },
    paletteActions,
  );

  useEffect(() => {
    if (!active) {
      onRegisterCommands?.([]);
      return;
    }
    onRegisterCommands?.(terminalCommands);
  }, [active, terminalCommands, onRegisterCommands]);

  const profileLabel = activeProfile?.name ?? null;

  function handleProfileDeleted(profileId: string) {
    discardProfileSessions(profileId);
    if (activeProfile?.id !== profileId) return;
    setLayout(null);
    setFocusedPaneId(null);
    setBroadcastInput(false);
  }

  const sidebarGroups = useMemo(
    () => (sidebarForest?.groups ?? []).map((g) => ({ id: g.id, name: g.name })),
    [sidebarForest],
  );
  const currentGroupId =
    selectedGroupId ??
    activeProfile?.workspaceId ??
    sidebarForest?.lastActiveGroupId ??
    sidebarGroups[0]?.id ??
    "";
  const currentGroup =
    sidebarForest?.groups.find((g) => g.id === currentGroupId) ?? sidebarForest?.groups[0] ?? null;
  const allProfiles = useMemo(
    () => sidebarForest?.groups.flatMap((g) => g.profiles) ?? [],
    [sidebarForest],
  );
  const settingsProfile = useMemo(
    () => allProfiles.find((p) => p.id === settingsProfileId) ?? null,
    [allProfiles, settingsProfileId],
  );
  const sidebarProfiles = useMemo(
    () =>
      (currentGroup?.profiles ?? []).map((p) => {
        const live = getProfilePanes(p.id);
        const terminals =
          live.length > 0
            ? live.map((pane, idx) => ({
                id: pane.id,
                profileId: p.id,
                tool: pane.tool,
                label: paneDisplayLabel(pane),
                description: pane.cwd || `${toolLabel(pane.tool)} ${idx + 1}`,
                live: true,
                minimized: p.id === activeProfile?.id ? isPaneMinimized(p.id, pane.id) : false,
              }))
            : p.terminals.map((terminal, idx) => ({
                id: `saved-${p.id}-${idx}`,
                profileId: p.id,
                tool: terminal.tool,
                label: terminal.title?.trim() || `${toolLabel(terminal.tool)} ${idx + 1}`,
                description: terminal.cwd,
                live: false,
              }));
        return {
          id: p.id,
          name: p.name,
          defaultTool: p.defaultTool,
          accentColor: p.accentColor,
          terminalCount: terminals.length,
          broadcastInput: p.broadcastInput,
          terminals,
        };
      }),
    [currentGroup?.profiles, getProfilePanes, activeProfile?.id, isPaneMinimized],
  );

  useProfileQuickSwitch({
    groupProfiles: currentGroup?.profiles ?? [],
    allProfiles,
    activeProfileId: activeProfile?.id ?? null,
    enabled: active && !profileBusy && !restoring,
    onActivate: (profile) => {
      void handleActivateProfileRef.current(profile);
    },
  });

  usePaneShortcuts({
    panes,
    focusedPaneId,
    enabled: active && layout !== null && !profileBusy && !restoring,
    onFocusPane: (paneId) => {
      if (activeProfile) focusPaneInDisplay(activeProfile.id, paneId);
      else setFocusedPaneId(paneId);
    },
    onClosePane: closePane,
    onClearPane: clearPaneScreen,
    onRestartPane: (id) => void respawnPane(id),
    onSplitPane: (id, dir) => void splitPane(id, dir),
  });

  const sidebar = (
    <div style={{ width: sidebarCollapsed ? 64 : sidebarWidth }}>
      <Sidebar
        groups={sidebarGroups}
        currentGroupId={currentGroupId}
        profiles={sidebarProfiles}
        activeProfileId={activeProfile?.id ?? null}
        activeTerminalId={focusedPaneId}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onGroupChange={(groupId) => {
          setSelectedGroupId(groupId);
          const group = sidebarForest?.groups.find((g) => g.id === groupId);
          const first = group?.profiles[0];
          if (first) void handleActivateProfile(first);
        }}
        onCreateGroup={() => {
          setCreateGroupOpen(true);
        }}
        onRenameGroup={(groupId) => {
          setSelectedGroupId(groupId);
          setRenameGroupOpen(true);
        }}
        onDeleteGroup={(groupId) => {
          const group = sidebarForest?.groups.find((g) => g.id === groupId);
          if (!group) return;
          const ok = confirm(t("profileGroup.deleteConfirm", { name: group.name }));
          if (!ok) return;
          void (async () => {
            await window.api.profileGroupDelete(groupId);
            await refreshSidebarForest();
          })();
        }}
        onCreateProfile={(groupId) => {
          setSelectedGroupId(groupId);
          setCreateProfileOpen(true);
        }}
        onProfileSelect={(profileId) => {
          const profile = currentGroup?.profiles.find((p) => p.id === profileId);
          if (profile) void handleActivateProfile(profile);
        }}
        onProfileReorder={(dragProfileId, dropProfileId) => {
          if (!currentGroup) return;
          const reordered = reorderById(currentGroup.profiles, dragProfileId, dropProfileId, (p) => p.id);
          if (!reordered) return;
          const orderedIds = reordered.map((p) => p.id);
          const prevForest = sidebarForest;
          setSidebarForest((prev) =>
            prev
              ? {
                  ...prev,
                  groups: prev.groups.map((g) =>
                    g.id === currentGroup.id ? { ...g, profiles: reordered } : g,
                  ),
                }
              : prev,
          );
          void (async () => {
            const r = await window.api.profileReorder(currentGroup.id, orderedIds);
            if (!r.success) {
              setSidebarForest(prevForest);
              return;
            }
            await refreshSidebarForest();
          })();
        }}
        onProfileSettings={(profileId) => setSettingsProfileId(profileId)}
        onProfileOpenFolder={(profileId) => {
          const profile = sidebarForest?.groups.flatMap((g) => g.profiles).find((p) => p.id === profileId);
          if (!profile) return;
          void (async () => {
            if (activeProfile?.id !== profile.id) await handleActivateProfile(profile);
            const hint =
              profile.defaultCwd?.trim() ||
              getProfileDefaultCwd() ||
              settings.workingDir?.trim() ||
              undefined;
            await openFolderPane(hint);
          })();
        }}
        onProfileAddTerminal={(profileId) => {
          const profile = sidebarForest?.groups.flatMap((g) => g.profiles).find((p) => p.id === profileId);
          if (profile) void handleNewTerminal(profile);
        }}
        onProfileToggleBroadcast={(profileId, enabled) => {
          void (async () => {
            await handleToggleBroadcast(profileId, enabled);
            await refreshSidebarForest();
          })();
        }}
        onProfilePaneDragChange={setProfileSidebarDrag}
        onTerminalRename={(profileId, terminalId, title) => {
          if (activeProfile?.id !== profileId) return;
          renamePane(terminalId, title);
        }}
        onTerminalClose={(profileId, terminalId) => {
          if (activeProfile?.id !== profileId) return;
          closePane(terminalId);
        }}
        onTerminalMinimize={(profileId, terminalId) => {
          if (activeProfile?.id !== profileId) return;
          minimizePane(profileId, terminalId);
        }}
        onTerminalRestore={(profileId, terminalId) => {
          const profile = sidebarForest?.groups
            .flatMap((g) => g.profiles)
            .find((p) => p.id === profileId);
          if (!profile) return;
          void restorePaneToDisplay(profile, terminalId);
        }}
        onTerminalReorder={(profileId, dragTerminalId, dropTerminalId, zone) => {
          if (activeProfile?.id !== profileId) return;
          setLayout((prev) =>
            prev ? movePaneInTree(prev, dragTerminalId, dropTerminalId, zone) : prev,
          );
          void persistCurrentProfile();
        }}
        onTerminalSelect={(profileId, terminalId, opts) => {
          const profile = sidebarForest?.groups
            .flatMap((g) => g.profiles)
            .find((p) => p.id === profileId);
          if (!profile) return;
          const pane = getProfilePanes(profile.id).find((p) => p.id === terminalId);
          if (pane) {
            if (
              opts?.placeBeside &&
              activeProfile?.id === profile.id &&
              focusedPaneId &&
              focusedPaneId !== pane.id
            ) {
              void placePaneBeside(profile, pane.id, focusedPaneId, "right");
              return;
            }
            void restorePaneToDisplay(profile, pane.id);
            return;
          }
          void handleActivateProfile(profile);
        }}
      />
    </div>
  );

  const sidebarDialogs = (
    <>
      <ProfileCreateDialog
        open={createProfileOpen}
        profiles={allProfiles}
        profileGroups={(sidebarForest?.groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
        defaultGroupId={currentGroup?.id ?? sidebarForest?.groups[0]?.id ?? ""}
        availableTools={availableTools}
        inventoryScanning={inventoryScanning}
        onClose={() => setCreateProfileOpen(false)}
        onCreate={(opts) => {
          setCreateProfileOpen(false);
          setSelectedGroupId(opts.groupId);
          void (async () => {
            const r = await window.api.profileCreate(opts.name, {
              groupId: opts.groupId,
              defaultCwd: opts.defaultCwd || undefined,
              defaultTool: opts.defaultTool,
              accentColor: opts.accentColor,
              broadcastInput: opts.broadcastInput,
              copyFromProfileId: opts.copyFromProfileId,
            });
            if (r.success && r.profile) await handleActivateProfile(r.profile);
            await refreshSidebarForest(opts.groupId);
          })();
        }}
        onQuickCreateGroup={async (name) => {
          const r = await window.api.profileGroupCreate(name);
          if (!r.success || !r.group) {
            return { ok: false, error: r.error ?? t("profileGroup.failedCreate") };
          }
          await refreshSidebarForest();
          setSelectedGroupId(r.group.id);
          return { ok: true, groupId: r.group.id };
        }}
      />
      <ProfileGroupNameDialog
        open={createGroupOpen}
        title={t("profileGroup.createTitle")}
        submitLabel={t("profileGroup.create")}
        busy={profileBusy}
        onClose={() => setCreateGroupOpen(false)}
        onSubmit={(name) => {
          setCreateGroupOpen(false);
          void (async () => {
            const r = await window.api.profileGroupCreate(name);
            if (r.success && r.group) setSelectedGroupId(r.group.id);
            await refreshSidebarForest();
          })();
        }}
      />
      <ProfileGroupNameDialog
        open={renameGroupOpen}
        title={t("profileGroup.renameTitle")}
        initialName={currentGroup?.name ?? ""}
        submitLabel={t("profileGroup.rename")}
        busy={profileBusy}
        onClose={() => setRenameGroupOpen(false)}
        onSubmit={(name) => {
          if (!currentGroup) {
            setRenameGroupOpen(false);
            return;
          }
          setRenameGroupOpen(false);
          void (async () => {
            await window.api.profileGroupUpdate(currentGroup.id, name);
            await refreshSidebarForest();
          })();
        }}
      />
      <ProfileSettingsDialog
        open={settingsProfileId !== null}
        profile={settingsProfile}
        availableTools={availableTools}
        inventoryScanning={inventoryScanning}
        busy={settingsBusy}
        onClose={() => setSettingsProfileId(null)}
        onSave={async (profileId: string, patch: ProfileSettingsPatch) => {
          setSettingsBusy(true);
          const r = await window.api.profileUpdate(profileId, patch);
          setSettingsBusy(false);
          if (!r.success) return;
          if (r.profile) {
            syncActiveProfile(r.profile);
            if (r.profile.id === activeProfile?.id) {
              updateSettings({ workingDir: r.profile.defaultCwd?.trim() ?? "" });
              setBroadcastInput(r.profile.broadcastInput ?? false);
            }
          }
          setSettingsProfileId(null);
          await refreshSidebarForest();
        }}
        onDelete={async (profile) => {
          const ok = confirm(t("profile.deleteConfirm", { name: profile.name }));
          if (!ok) return;
          setSettingsBusy(true);
          await window.api.profileDelete(profile.id);
          setSettingsBusy(false);
          handleProfileDeleted(profile.id);
          setSettingsProfileId(null);
          await refreshSidebarForest();
        }}
      />
    </>
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
        displayDropActive ? "ring-2 ring-inset ring-chrome-ui-accent/40" : ""
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
        broadcastActive={broadcastActive}
        broadcastPaneCount={panes.length}
        paneAgentStates={paneAgentStates}
        onFocusPane={(paneId) => {
          if (activeProfile) focusPaneInDisplay(activeProfile.id, paneId);
          else setFocusedPaneId(paneId);
        }}
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
            bg={useAppThemeBg ? undefined : settings.terminalBg}
            fontFamily={terminalFontFamily}
            fontSize={terminalFontSize}
            scrollback={terminalScrollback}
            rightClickPaste={settings.terminalRightClickPaste}
            copyOnSelect={settings.terminalCopyOnSelect}
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
            <p className="mt-2 text-[12px] text-fail">{terminalError}</p>
          )}
          <p className="mt-2 text-[11px] text-chrome-text-dim">{t("chat.shortcutHint", paneShortcutLabels)}</p>
          <p className="mt-1 text-[11px] text-chrome-text-dim">
            {t("chat.profileShortcutHint", paneShortcutLabels)}
          </p>
          <p className="mt-1 text-[11px] text-chrome-text-dim">{t("chat.debugHint")}</p>
        </div>
      ) : (
        <EmptyState
          tone="chrome"
          icon="👋"
          title={t("chat.pickProfileTitle")}
          description={t("chat.pickProfile")}
        />
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
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 overflow-hidden bg-chrome-bg text-chrome-text" data-surface="chrome">
        {sidebarDialogs}
        {sidebar}
        {!sidebarCollapsed && (
          <div className="w-2.5 shrink-0 self-stretch" style={{ width: 10 }}>
            <ResizeDivider
              mode="delta"
              orientation="horizontal"
              onResize={(delta) =>
                setSidebarWidth((w) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w + delta)))
              }
            />
          </div>
        )}
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          {topBar}
          {terminalError && (
            <div className="shrink-0 border-b border-fail/30 bg-fail/15 px-3 py-2 text-[12px] text-fail">
              {terminalError}
            </div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{terminalArea}</div>
          <TerminalStatusBar pane={focusedPane} />
        </div>
      </div>
    </TooltipProvider>
  );
}

export const ChatTab = memo(ChatTabInner, (prev, next) => {
  return (
    prev.active === next.active &&
    prev.inventoryScanning === next.inventoryScanning &&
    prev.onRegisterCommands === next.onRegisterCommands &&
    inventoryTerminalFingerprint(prev.data) === inventoryTerminalFingerprint(next.data)
  );
});

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
  onAddPane: (tool: string) => void;
  onOpenFolder: () => void;
  available: ProviderEntry[];
  splitShortcutLabels: { splitRight: string; splitDown: string };
}) {
  const { t } = useLocale();
  const accent = profileAccentColor;
  const hasAccent = Boolean(accent);

  return (
    <div className="relative z-40 flex h-10 shrink-0 items-center gap-2 overflow-visible border-b border-chrome-border bg-chrome-bg/95 px-3 backdrop-blur-sm">
      {profileLabel && (
        <div
          className="flex min-w-0 max-w-[280px] items-center gap-2 rounded-lg border px-2 py-1"
          style={profileTopBarBadgeStyle(accent)}
          title={profileLabel}
        >
          {hasAccent && (
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={profileAccentMarkerStyle(accent!, "sm")}
              aria-hidden
            />
          )}
          <span
            className="min-w-0 truncate text-[11px] font-medium"
            style={profileTopBarLabelStyle(accent)}
          >
            {profileLabel}
          </span>
          {paneCount > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-chrome-text-faint">
              {paneCount}/{maxPanes}
            </span>
          )}
          {broadcastInput && paneCount > 1 && (
            <span
              className="broadcast-sync-badge inline-flex shrink-0 items-center gap-1 rounded-full border border-chrome-ui-accent/30 bg-chrome-ui-accent/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-chrome-accent-text"
              title={t("chat.broadcastSyncTitle", { count: paneCount })}
            >
              <span className="broadcast-sync-dot h-1 w-1 rounded-full bg-chrome-ui-accent" aria-hidden />
              {t("chat.syncLabel")}
            </span>
          )}
        </div>
      )}
      {restoring && <span className="text-[11px] text-chrome-text-subtle">{t("chat.restoringShort")}</span>}

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="chromeOutline"
          size="sm"
          disabled={!canAddPane || restoring}
          onClick={onOpenFolder}
          title={canAddPane ? t("chat.pickFolderPane") : t("chat.maxPanesTitle", { max: maxPanes })}
        >
          <FolderOpen />
          {t("chat.folderBtn")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="chromeOutline"
              size="sm"
              disabled={!canAddPane}
              title={
                canAddPane
                  ? t("chat.addPaneTitle", splitShortcutLabels)
                  : t("chat.maxPanesTitle", { max: maxPanes })
              }
            >
              {t("chat.addPane")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem
              title={t("chat.plainShellTitle")}
              onSelect={() => onAddPane(PLAIN_SHELL_TOOL_ID)}
            >
              <ToolLogo tool={PLAIN_SHELL_TOOL_ID} size={14} />
              {profileToolLabel(PLAIN_SHELL_TOOL_ID)}
            </DropdownMenuItem>
            {available.length > 0 && <DropdownMenuSeparator />}
            {available.map((e) => (
              <DropdownMenuItem key={e.tool} onSelect={() => onAddPane(e.tool)}>
                <ToolLogo tool={e.tool} size={14} />
                {toolLabel(e.tool)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
      {err && <p className="rounded-md bg-fail/10 px-3 py-2 text-[12px] text-fail">{err}</p>}
      {disabled ? (
        <p className="text-center text-[13px] text-chrome-text-subtle">{t("chat.notInstalled")}</p>

      ) : (
        <div className="mt-auto grid grid-cols-2 gap-3">
          <Button variant="chromeOutline" className="w-full" disabled={extBusy} onClick={handleExternal}>
            {extBusy ? <Loader2 className="animate-spin" /> : <Monitor />}
            {t("chat.externalBtn")}
          </Button>
          <Button variant="chromeSolid" className="w-full" disabled={inAppBusy} onClick={handleInApp}>
            {inAppBusy ? <Loader2 className="animate-spin" /> : <Terminal />}
            {t("chat.inAppBtn")}
          </Button>
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

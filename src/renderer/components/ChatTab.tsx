import {
  Fragment,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronLeft,
  Monitor,
  Terminal,
  FolderOpen,
  Hand,
  SquareTerminal,
} from "lucide-react";
import { TITLE_BAR_TERMINAL_SLOT_ID } from "./TitleBarBrand";
import { WarmTypingDots } from "./WarmTypingDots";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  PaneViewDecl,
  PaneViewIntent,
  ProfileForest,
  ProviderEntry,
  ProfileInfo,
  RemoteSshConfig,
} from "../types";
import { isRemotePaneCwd } from "../utils/remote-ssh";
import { ToolLogo } from "./ToolLogo";
import { EmptyState } from "./EmptyState";
import { toolLabel } from "../utils";
import { AuthBadge } from "./Badge";
import { EmbeddedTerminal } from "./EmbeddedTerminal";
import { TerminalStatusBar } from "./TerminalStatusBar";
import { Sidebar } from "./Sidebar";
import { BusyPaneCloseDialog } from "./BusyPaneCloseDialog";
import { GitWorktreeDialog } from "./GitWorktreeDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProfileCreateDialog } from "./ProfileCreateDialog";
import { ProfileGroupNameDialog } from "./ProfileGroupNameDialog";
import { ProfileSettingsDialog, type ProfileSettingsPatch } from "./ProfileSettingsDialog";
import { SplitPaneLayout, type PanePopOutSize, type PanePopOutTrigger } from "./SplitPaneLayout";
import { ResizeDivider } from "./ResizeDivider";
import {
  useProfileWorkspace,
  type ProfileWorkspaceViewHooks,
  type SpawnPaneOptions,
} from "../hooks/useProfileWorkspace";
import {
  usePaneAgentAwareness,
  type BackgroundAgentNotice,
  type BackgroundAgentOptions,
  type BackgroundAgentPane,
} from "../hooks/usePaneAgentAwareness";
import {
  enqueuePaneNotice,
  strongestAttention,
} from "../../shared/background-agent-attention.js";
import { BackgroundAgentToasts, type BackgroundAgentToast } from "./BackgroundAgentToasts";
import { isPaneAgentBusy, strongestPaneAgentStatus } from "../../shared/pane-agent-state.js";
import { usePaneShortcuts } from "../hooks/usePaneShortcuts";
import { useTerminalNotifications } from "../hooks/useTerminalNotifications";
import { CommandHistoryPanel, type SaveCommandResult } from "./CommandHistoryPanel";
import { savedCommandNameFor } from "../terminal/command-history";
import {
  copySplitRatios,
  equalizeAllSplits,
  findPaneInDirection,
  resizePaneInDirection,
  swapPaneLeaves,
} from "../terminal/split-tree";
import { useProfileQuickSwitch } from "../hooks/useProfileQuickSwitch";
import { useSlideDirection } from "../hooks/useSlideDirection";
import { useTerminalFocusMru } from "../hooks/useTerminalFocusMru";
import {
  forestWithoutDefaultProfilesMirror,
  preferredVisibleGroupId,
} from "../terminal/default-profiles-workspace";
import { shouldIgnoreShortcutForIme } from "../terminal/ime-keys";
import { getActiveKeybindings } from "../shortcuts/active-keybindings";
import { openShortcutCheatsheet } from "../shortcuts/open-shortcuts";
import { clearTerminalSession } from "../terminal/terminal-session-actions";
import { matchShortcut, resolveKeybindings } from "../shortcuts/keybindings";
import { shortcutKeys } from "../shortcuts/shortcut-registry";
import {
  collectPanes,
  equalizeRunAroundPane,
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
import {
  normalizePaneTitle,
  paneDisplayLabel,
  paneDisplayLabels,
  paneToolLabel,
} from "../utils/pane-label";
import { PROFILES_CHANGED_EVENT } from "../utils/profile-events";
import { slideClassName } from "../utils/workspace-slide";
import { hitPaneDropZone } from "../terminal/pane-drop-zone";
import {
  displayLayoutWithoutPoppedOut,
  focusAfterPopOut,
  withoutPoppedOut,
} from "../terminal/popout-panes";
import {
  addPaneToView,
  deserializeViews,
  findViewOfPane,
  hiddenPaneIds,
  newViewId,
  removePaneFromViews,
  resolveViews,
  serializeViews,
  viewPaneIds,
  type PaneView,
} from "../terminal/pane-views";
import type { PaneDropZone } from "../terminal/pane-drop-zone";
import {
  hasProfilePaneDrag,
  readProfilePaneDrag,
  shouldShowSavedTerminalPreview,
  visiblePanes,
} from "../terminal/profile-pane-display";
import { applyAppTheme, useAppThemeRevision } from "../app-theme";
import {
  profileAccentMarkerStyle,
  profileTopBarBadgeStyle,
  profileTopBarLabelStyle,
} from "../utils/profile-colors";
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  getAppBg,
  isAppThemeTerminalBg,
  bumpDirHistory,
  loadSettings,
  saveSettings,
  subscribeSettingsChanges,
  type ChatSettings,
} from "../chat-settings";
import { resolveToolLaunchExtraArgs } from "../../tool-launch.js";
import { agentSessionSupported } from "../../shared/agent-session-resume.js";
import {
  PLAIN_SHELL_TOOL_ID,
  isPlainShellTool,
  profileToolLabel,
  resolveEmbeddedPtyShell,
  resolveInstalledLaunchTool,
  resolveLaunchTool,
  toolIdsFromInventory,
} from "../utils/available-tools";
import { reorderById } from "../utils/reorder-by-id";
import { useLocale } from "../i18n/LocaleProvider";
import { zoomFontSize } from "../terminal/font-zoom";
import { effectiveMaximizedPaneId, toggleMaximizedPaneId } from "../terminal/split-tree";
import type { Command } from "./CommandPalette";
import { useTerminalCommands } from "../hooks/useTerminalCommands";
import {
  SIDEBAR_EASE,
  SIDEBAR_GUTTER_WIDTH,
  SIDEBAR_MOTION_MS,
  SIDEBAR_RAIL_WIDTH,
} from "../sidebar-collapse";

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

function profileKeyOf(profile: { workspaceId: string; id: string }): string {
  return `${profile.workspaceId}:${profile.id}`;
}

/** Main and chat windows restore the same profile independently — keep their views apart. */
function viewStoreKey(profileKey: string): string {
  const route = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return `${route === "chat" ? "chat" : "main"}|${profileKey}`;
}

function ChatTabInner({
  data,
  active = true,
  inventoryScanning = false,
  onRegisterCommands,
  onRequestTerminalMode,
}: {
  data: ProviderEntry[];
  active?: boolean;
  inventoryScanning?: boolean;
  onRegisterCommands?: (commands: Command[]) => void;
  onRequestTerminalMode?: () => void;
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
  // Main window: the top bar lives in the app title bar. Chat / pop-out windows
  // have no slot, so they keep it as a row above the panes.
  const [titleBarSlot, setTitleBarSlot] = useState<HTMLElement | null>(() =>
    document.getElementById(TITLE_BAR_TERMINAL_SLOT_ID),
  );
  useLayoutEffect(() => {
    setTitleBarSlot(document.getElementById(TITLE_BAR_TERMINAL_SLOT_ID));
  }, []);
  const [sidebarContentCollapsed, setSidebarContentCollapsed] = useState(loadSidebarCollapsed);
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  sidebarCollapsedRef.current = sidebarCollapsed;
  const [sidebarMotionEpoch, setSidebarMotionEpoch] = useState(0);
  const [sidebarForest, setSidebarForest] = useState<ProfileForest | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [busyClosePaneId, setBusyClosePaneId] = useState<string | null>(null);
  /**
   * Extra view windows of this window's profiles. Their panes stay in the profile
   * layout (saved / restored / counted there) and are only hidden from this display.
   */
  const [views, setViewsState] = useState<PaneView[]>([]);
  const viewsRef = useRef(views);
  const setViews = useCallback((next: PaneView[] | ((prev: PaneView[]) => PaneView[])) => {
    const value = typeof next === "function" ? next(viewsRef.current) : next;
    viewsRef.current = value;
    setViewsState(value);
  }, []);
  const [commandHistoryOpen, setCommandHistoryOpen] = useState(false);
  /** Pane the "new pane in a git worktree" dialog splits from. */
  const [worktreePaneId, setWorktreePaneId] = useState<string | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<ProfileInfo | null>(null);
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
  /** Synchronous mirror of per-group last profile (avoids stale sidebarForest on fast switches). */
  const lastActiveByGroupRef = useRef<Record<string, string>>({});

  const panes = layout ? collectPanes(layout) : [];
  const paneLabels = useMemo(
    () => paneDisplayLabels(layout ? collectPanes(layout) : []),
    [layout],
  );
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

  const keymap = useMemo(
    () => resolveKeybindings(settings.keybindings),
    [settings.keybindings],
  );
  const paneShortcutLabels = useMemo(
    () => ({
      focusNext: shortcutKeys("focusNext", keymap),
      splitRight: shortcutKeys("splitHorizontal", keymap),
      splitDown: shortcutKeys("splitVertical", keymap),
      commandPalette: shortcutKeys("commandPalette", keymap),
      toggleMaximize: shortcutKeys("toggleMaximizePane", keymap),
    }),
    [keymap],
  );
  const useAppThemeBg = isAppThemeTerminalBg(settings.terminalBg);
  const bg = useAppThemeBg ? getAppBg() : settings.terminalBg;
  const terminalFontFamily = settings.terminalFontFamily;
  const terminalFontSize = settings.terminalFontSize;
  const terminalScrollback = settings.terminalScrollback;
  const availableTools = useMemo(() => toolIdsFromInventory(data), [data]);

  const spawnPane = useCallback(async (
    tool: string,
    cwd: string,
    remote: RemoteSshConfig | null,
    opts?: SpawnPaneOptions,
  ): Promise<PaneInfo | null> => {
    const extraArgs = resolveToolLaunchExtraArgs(settings.toolLaunchArgs, tool);
    const shell = resolveEmbeddedPtyShell(
      settings.preferredShell,
      settings.externalTerminal,
      tool,
    );
    // A remote pane's cwd (`host:dir`) is meaningless locally, and vice versa.
    const localCwd = remote || isRemotePaneCwd(cwd) ? "" : cwd;
    // Conversation resume reads the local transcript store, so remote panes skip it.
    const agentSession =
      !remote && settings.terminalResumeAgentSessions && agentSessionSupported(tool)
        ? { resumeId: opts?.resumeAgentSessionId }
        : undefined;
    const spawnOptions = remote
      ? { remote }
      : shell === "wsl" || agentSession
        ? {
            ...(shell === "wsl" ? { wslDistro: settings.wslDistro } : {}),
            ...(agentSession ? { agentSession } : {}),
          }
        : undefined;
    const result = await window.api.ptySpawn(
      tool,
      localCwd || undefined,
      extraArgs,
      shell,
      spawnOptions,
    );
    if (!result.success || !result.sessionId) {
      const msg = result.error ?? "unknown error";
      console.error("[pty-spawn]", tool, msg);
      setTerminalError(
        result.code === "SSH_NOT_FOUND"
          ? t("chat.err.sshNotFound")
          : t("chat.err.startFailed", { tool, msg }),
      );
      return null;
    }
    setTerminalError(null);
    return {
      id: result.sessionId,
      tool,
      sessionId: result.sessionId,
      cwd: result.cwd || cwd || "",
      ...(result.agentSessionId ? { agentSessionId: result.agentSessionId } : {}),
    };
  }, [
    settings.externalTerminal,
    settings.preferredShell,
    settings.terminalResumeAgentSessions,
    settings.toolLaunchArgs,
    settings.wslDistro,
    t,
  ]);

  const spawnPaneResilient = useCallback(
    async (
      tool: string,
      cwd: string,
      remote: RemoteSshConfig | null,
      opts?: SpawnPaneOptions,
    ): Promise<PaneInfo | null> => {
      // Fallbacks stay on the same target: a remote profile retries over ssh, never locally.
      const order = [tool, ...(tool !== "shell" ? ["shell"] : [])];
      for (const t of order) {
        // The saved conversation id belongs to the agent tool, never the shell fallback.
        const pane = await spawnPane(t, cwd, remote, t === tool ? opts : undefined);
        if (pane) return pane;
      }
      return spawnPane("shell", cwd, remote);
    },
    [spawnPane],
  );

  // Views are saved per machine with the profile layout and reopened when the profile restores.
  const viewHooks = useMemo<ProfileWorkspaceViewHooks>(
    () => ({
      onPersist: (profile, tree) => {
        const key = profileKeyOf(profile);
        void window.api.paneViewStoreSave(
          viewStoreKey(key),
          serializeViews(
            viewsRef.current.filter((v) => v.profileKey === key),
            tree,
          ),
        );
      },
      prepareRestoredViews: async (profile, slotPanes) => {
        const key = profileKeyOf(profile);
        const saved = await window.api.paneViewStoreGet(viewStoreKey(key));
        const restored = deserializeViews(saved, slotPanes, key);
        return () => setViews((prev) => [...prev.filter((v) => v.profileKey !== key), ...restored]);
      },
    }),
    [setViews],
  );

  const {
    activeProfile,
    backgroundProfilePanes,
    restoring,
    isRestoring,
    migrationDone,
    activateProfile,
    restoreLastProfile,
    discardProfileSessions,
    syncActiveProfile,
    remapProfileWorkspace,
    getProfileDefaultCwd,
    getProfilePanes,
    getProfileFocusedPaneId,
    isPaneLive,
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
    closePaneInStashedProfile,
    getProfileLayoutByKey,
  } = useProfileWorkspace(
    layout,
    setLayout,
    focusedPaneId,
    setFocusedPaneId,
    spawnPaneResilient,
    settings.workingDir,
    broadcastInput,
    viewHooks,
  );
  const activeProfileKey = activeProfile ? profileKeyOf(activeProfile) : null;
  /** Active-profile panes living in a view window (hidden here). */
  const poppedOutPaneIds = useMemo(
    () => hiddenPaneIds(views, activeProfileKey),
    [views, activeProfileKey],
  );
  /** Panes on screen in this window (view panes take input only from their own window). */
  const dockedPanes = useMemo(
    () => withoutPoppedOut(panes, poppedOutPaneIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, poppedOutPaneIds],
  );

  /** Read at call time so add / restart always target the active profile's machine. */
  const activeRemoteRef = useRef<RemoteSshConfig | null>(null);
  activeRemoteRef.current = activeProfile?.remote ?? null;

  /** Layout drawn in this window: popped-out panes are left out. */
  const shownLayout = useMemo(
    () => displayLayoutWithoutPoppedOut(displayLayout, poppedOutPaneIds, focusedPaneId),
    [displayLayout, poppedOutPaneIds, focusedPaneId],
  );

  /**
   * Maximized pane — view state only, never written to the layout. It lapses on
   * its own when the pane closes, is minimized, or another pane takes focus.
   */
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const shownMaximizedPaneId = effectiveMaximizedPaneId(
    shownLayout,
    maximizedPaneId,
    focusedPaneId,
  );
  useEffect(() => {
    // Drop a lapsed maximize so refocusing that pane later does not re-maximize it.
    if (maximizedPaneId && !shownMaximizedPaneId) setMaximizedPaneId(null);
  }, [maximizedPaneId, shownMaximizedPaneId]);
  const toggleMaximizePane = useCallback(
    (paneId: string) => {
      setMaximizedPaneId((prev) => toggleMaximizedPaneId(shownLayout, prev, paneId));
    },
    [shownLayout],
  );

  /** Live panes of non-active profiles, labelled for notifications. */
  const backgroundAgentPanes = useMemo<BackgroundAgentPane[]>(() => {
    if (backgroundProfilePanes.length === 0) return [];
    const names = new Map<string, string>();
    for (const g of sidebarForest?.groups ?? []) {
      for (const p of g.profiles) names.set(p.id, p.name);
    }
    return backgroundProfilePanes.map((b) => ({
      pane: b.pane,
      profileId: b.profileId,
      profileName: names.get(b.profileId) ?? b.profileId,
    }));
  }, [backgroundProfilePanes, sidebarForest]);
  const backgroundAgentPanesRef = useRef(backgroundAgentPanes);
  backgroundAgentPanesRef.current = backgroundAgentPanes;

  const [backgroundToasts, setBackgroundToasts] = useState<BackgroundAgentToast[]>([]);
  const backgroundToastSeqRef = useRef(0);
  const handleBackgroundNotice = useCallback((notice: BackgroundAgentNotice) => {
    const id = ++backgroundToastSeqRef.current;
    setBackgroundToasts((prev) => enqueuePaneNotice(prev, { ...notice, id }));
  }, []);
  const dismissBackgroundToast = useCallback((id: number) => {
    setBackgroundToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);
  const backgroundAgentOptions = useMemo<BackgroundAgentOptions>(
    () => ({ panes: backgroundAgentPanes, onNotice: handleBackgroundNotice }),
    [backgroundAgentPanes, handleBackgroundNotice],
  );

  const { paneAgentStates, recordPaneAgentInput, backgroundAttention, backgroundPaneAttention } =
    usePaneAgentAwareness(
      panes,
      focusedPaneId,
      settings,
      t,
      windowFocused,
      backgroundAgentOptions,
    );

  const handleTerminalNotify = useTerminalNotifications({
    panes,
    focusedPaneId,
    windowFocused,
    viewActive: active,
    settings,
    t,
  });

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

  // Broadcast input / paste targets: docked panes only (main ignores writes to a
  // popped-out session from any window but its pop-out).
  const panesRef = useRef(dockedPanes);
  panesRef.current = dockedPanes;

  const handlePtyWrite = useCallback(
    (data: string, sessionId: string) => {
      const current = panesRef.current;
      if (broadcastInput && current.length > 1) {
        for (const p of current) {
          void window.api.ptyWrite(p.sessionId, data);
          recordPaneAgentInput(p.sessionId);
        }
      } else {
        void window.api.ptyWrite(sessionId, data);
        recordPaneAgentInput(sessionId);
      }
    },
    [broadcastInput, recordPaneAgentInput],
  );

  const broadcastActive = broadcastInput && dockedPanes.length > 1;

  const broadcastInputRef = useRef(broadcastInput);
  broadcastInputRef.current = broadcastInput;

  // Stable (refs) so memoized EmbeddedTerminals always see the live broadcast state.
  const getPasteTargets = useCallback((sessionId: string): string[] => {
    const current = panesRef.current;
    if (broadcastInputRef.current && current.length > 1) return current.map((p) => p.sessionId);
    return [sessionId];
  }, []);

  const pasteConfirm = useMemo(
    () => ({
      enabled: settings.terminalPasteConfirm,
      maxLines: settings.terminalPasteConfirmMaxLines,
      maxChars: settings.terminalPasteConfirmMaxChars,
      alwaysWhenBroadcast: settings.terminalPasteConfirmBroadcast,
    }),
    [
      settings.terminalPasteConfirm,
      settings.terminalPasteConfirmMaxLines,
      settings.terminalPasteConfirmMaxChars,
      settings.terminalPasteConfirmBroadcast,
    ],
  );

  // Palette "broadcast command" — always sends to every pane and presses Enter,
  // independent of the broadcast-input toggle (which only mirrors keystrokes).
  const broadcastCommandToPanes = useCallback((text: string) => {
    const current = panesRef.current;
    if (current.length === 0) return;
    const line = text.endsWith("\n") || text.endsWith("\r") ? text : `${text}\r`;
    for (const p of current) {
      void window.api.ptyWrite(p.sessionId, line);
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

  const sidebarAnimating = sidebarMotionEpoch > 0;

  const commitSidebarCollapsed = useCallback((next: boolean) => {
    if (sidebarCollapsedRef.current === next) return;
    sidebarCollapsedRef.current = next;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSidebarMotionEpoch(0);
      setSidebarContentCollapsed(next);
    } else {
      setSidebarMotionEpoch((n) => n + 1);
      // Open the full list immediately so the growing column reveals it.
      // Closing keeps the wide list until the column has finished clipping shut.
      if (!next) setSidebarContentCollapsed(false);
    }
    setSidebarCollapsed(next);
  }, []);

  useEffect(() => {
    if (sidebarMotionEpoch === 0) return;
    const id = window.setTimeout(() => {
      setSidebarMotionEpoch(0);
      setSidebarContentCollapsed(sidebarCollapsedRef.current);
    }, SIDEBAR_MOTION_MS);
    return () => window.clearTimeout(id);
  }, [sidebarMotionEpoch]);

  const refreshSidebarForest = useCallback(async (preferredGroupId?: string | null) => {
    const r = await window.api.profileGroupGetForest();
    if (!r.success || !r.forest) return;
    // Prefer in-session activations over forest (forest refresh can lag behind activate).
    lastActiveByGroupRef.current = {
      ...(r.forest.lastActiveByGroup ?? {}),
      ...lastActiveByGroupRef.current,
    };
    const forest = forestWithoutDefaultProfilesMirror(r.forest);
    setSidebarForest(forest);
    setSelectedGroupId(
      preferredVisibleGroupId(forest, [
        preferredGroupId,
        activeProfile?.workspaceId,
        forest.lastActiveGroupId,
      ]),
    );
  }, [activeProfile?.workspaceId]);

  useEffect(() => {
    void refreshSidebarForest();
  }, [refreshSidebarForest, activeProfile?.id]);

  // Keep active profile paneCount / saved-terminal preview in sync locally —
  // avoid full forest IPC on every split/close.
  useEffect(() => {
    if (!activeProfile?.id) return;
    setSidebarForest((prev) => {
      if (!prev) return prev;
      let changed = false;
      const groups = prev.groups.map((g) => ({
        ...g,
        profiles: g.profiles.map((p) => {
          if (p.id !== activeProfile.id) return p;
          const nextTerminals = panes.length === 0 ? [] : p.terminals;
          if (p.paneCount === panes.length && nextTerminals === p.terminals) return p;
          changed = true;
          return { ...p, paneCount: panes.length, terminals: nextTerminals };
        }),
      }));
      return changed ? { ...prev, groups } : prev;
    });
  }, [activeProfile?.id, panes.length]);

  useEffect(() => {
    const unsub = window.api.onSyncDataApplied(() => {
      void refreshSidebarForest();
    });
    const onProfilesChanged = () => {
      void refreshSidebarForest();
    };
    window.addEventListener(PROFILES_CHANGED_EVENT, onProfilesChanged);
    return () => {
      unsub();
      window.removeEventListener(PROFILES_CHANGED_EVENT, onProfilesChanged);
    };
  }, [refreshSidebarForest]);

  useEffect(() => {
    const onDragEnd = () => setProfileSidebarDrag(false);
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);


  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (shouldIgnoreShortcutForIme(ev)) return;
      if (!matchShortcut(ev, getActiveKeybindings(), ["toggleSidebar"])) return;

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
      commitSidebarCollapsed(!sidebarCollapsedRef.current);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [commitSidebarCollapsed]);

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

      const pane = await spawnPaneResilient(
        tool || "shell",
        resolveCwd(cwd),
        activeRemoteRef.current,
      );
      if (!pane) return null;

      setLayout((prev) => {
        if (!prev) return { kind: "pane", pane };
        const targetId = splitTargetId ?? focusedPaneId ?? collectPanes(prev)[0]?.id;
        if (!targetId) return { kind: "pane", pane };
        return equalizeRunAroundPane(splitPaneInTree(prev, targetId, direction, pane), pane.id);
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
        // Main resumes only when the transcript exists for the new cwd, else starts fresh.
        const next = await spawnPaneResilient(tool, cwd, activeRemoteRef.current, {
          resumeAgentSessionId: victim.agentSessionId,
        });
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

  /**
   * Restart a pane's PTY. Agent panes resume their conversation unless
   * `newConversation` is set ("Start new conversation").
   */
  const respawnPane = useCallback(
    async (paneId: string, opts?: { newConversation?: boolean }) => {
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
        const next = await spawnPaneResilient(tool, cwd, activeRemoteRef.current, {
          resumeAgentSessionId: opts?.newConversation ? undefined : victim.agentSessionId,
        });
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

  /** Update pane cwd from OSC 7 without killing the session. */
  const reportPaneCwd = useCallback((sessionId: string, nextCwd: string) => {
    const cwd = nextCwd.trim();
    if (!cwd) return;
    setLayout((prev) => {
      if (!prev) return prev;
      const panes = collectPanes(prev);
      const hit = panes.find((p) => p.sessionId === sessionId);
      if (!hit || hit.cwd === cwd) return prev;
      return mapPanesInTree(prev, (p) =>
        p.sessionId === sessionId ? { ...p, cwd } : p,
      );
    });
  }, []);

  /** Live pane title from OSC 0 / 2 ("" clears); shown only while no user title is set. */
  const reportPaneTitle = useCallback((sessionId: string, nextTitle: string) => {
    const autoTitle = nextTitle.trim() || undefined;
    setLayout((prev) => {
      if (!prev) return prev;
      const hit = collectPanes(prev).find((p) => p.sessionId === sessionId);
      if (!hit || hit.autoTitle === autoTitle) return prev;
      return mapPanesInTree(prev, (p) =>
        p.sessionId === sessionId ? { ...p, autoTitle } : p,
      );
    });
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
      const tool = resolveInstalledLaunchTool(activeProfile?.defaultTool ?? availableTools[0], data);
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
      data,
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

  const performClosePane = useCallback(
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

  const closePane = useCallback(
    (paneId: string, opts?: { skipConfirm?: boolean }) => {
      if (!opts?.skipConfirm) {
        const status = paneAgentStates[paneId];
        if (status && isPaneAgentBusy(status)) {
          setBusyClosePaneId(paneId);
          return;
        }
      }
      performClosePane(paneId);
    },
    [paneAgentStates, performClosePane],
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

  const openWorktreeDialog = useCallback(
    (paneId?: string) => {
      const id = paneId ?? focusedPaneId;
      const pane = id && layout ? collectPanes(layout).find((p) => p.id === id) : null;
      if (!pane?.cwd) {
        setTerminalError(t("git.worktree.err.noPane"));
        return;
      }
      // Worktrees are created with the local git; a remote (SSH) pane's repo lives elsewhere.
      if (isRemotePaneCwd(pane.cwd)) {
        setTerminalError(t("git.worktree.err.remotePane"));
        return;
      }
      if (isRestoring()) {
        setTerminalError(t("chat.err.restoringWait"));
        return;
      }
      if (!canAddPane) {
        setTerminalError(t("chat.err.maxPanes", { max: maxPanes }));
        return;
      }
      setWorktreePaneId(pane.id);
    },
    [focusedPaneId, layout, isRestoring, canAddPane, maxPanes, t],
  );

  /** Split the source pane and start the same tool in the new worktree. */
  const openWorktreePane = useCallback(
    async (path: string): Promise<string | null> => {
      const sourceId = worktreePaneId;
      const parent = sourceId && layout ? collectPanes(layout).find((p) => p.id === sourceId) : null;
      const tool = resolveLaunchTool(parent?.tool ?? availableTools[0], availableTools);
      const created = await addPane(tool, path, parent?.id, "horizontal", {
        keepOthersVisible: true,
      });
      return created ? null : t("git.worktree.err.openFailed", { path });
    },
    [worktreePaneId, layout, availableTools, addPane, t],
  );

  async function handleActivateProfile(profile: ProfileInfo) {
    lastActiveByGroupRef.current = {
      ...lastActiveByGroupRef.current,
      [profile.workspaceId]: profile.id,
    };
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
      if (findViewOfPane(viewsRef.current, paneId)) {
        void window.api.paneViewFocus(paneId);
        return;
      }
      const bg = backgroundAgentPanesRef.current.find((b) => b.pane.id === paneId);
      if (bg) {
        void openBackgroundPaneRef.current(bg.profileId, paneId);
        return;
      }
      if (activeProfile) focusPaneInDisplay(activeProfile.id, paneId);
      else setFocusedPaneId(paneId);
    });
    return unsub;
  }, [activeProfile, focusPaneInDisplay]);

  async function restorePaneToDisplay(profile: ProfileInfo, paneId: string) {
    if (findViewOfPane(viewsRef.current, paneId)) {
      void window.api.paneViewFocus(paneId);
      return;
    }
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
    if (findViewOfPane(viewsRef.current, paneId)) {
      void window.api.paneViewFocus(paneId);
      return;
    }
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
        resolveInstalledLaunchTool(profile.defaultTool, data),
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

  const handleNewTerminalRef = useRef(handleNewTerminal);
  handleNewTerminalRef.current = handleNewTerminal;

  const runSavedCommand = useCallback(
    async (profileId: string, command: string, broadcast: boolean) => {
      const profile = sidebarForest?.groups
        .flatMap((g) => g.profiles)
        .find((p) => p.id === profileId);
      if (!profile) return;

      if (activeProfile?.id !== profileId) {
        await handleActivateProfileRef.current(profile);
      }

      // Popped-out panes take input only from their own window.
      const docked = () =>
        withoutPoppedOut(
          getProfilePanes(profileId),
          hiddenPaneIds(viewsRef.current, profileKeyOf(profile)),
        );
      let targetPanes = docked();
      if (targetPanes.length === 0) {
        await handleNewTerminalRef.current(profile);
        targetPanes = docked();
      }
      if (targetPanes.length === 0) return;

      const line = command.endsWith("\n") || command.endsWith("\r") ? command : `${command}\r`;
      if (broadcast) {
        for (const p of targetPanes) {
          void window.api.ptyWrite(p.sessionId, line);
          recordPaneAgentInput(p.sessionId);
        }
        return;
      }

      const focusId = getProfileFocusedPaneId(profileId);
      const target =
        (focusId ? targetPanes.find((p) => p.id === focusId) : null) ?? targetPanes[0];
      if (!target) return;
      void window.api.ptyWrite(target.sessionId, line);
      recordPaneAgentInput(target.sessionId);
    },
    [sidebarForest, activeProfile?.id, getProfilePanes, getProfileFocusedPaneId, recordPaneAgentInput],
  );

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
      addPane: (tool: string) => {
        onRequestTerminalMode?.();
        void addPane(tool);
      },
      openExternal: (tool: string) => {
        onRequestTerminalMode?.();
        void openExternal(tool);
      },
      activateProfile: (profileId: string) => {
        onRequestTerminalMode?.();
        const profile = sidebarForest?.groups
          .flatMap((g) => g.profiles)
          .find((p) => p.id === profileId);
        if (profile) void handleActivateProfileRef.current(profile);
      },
      broadcastCommand: (text: string) => {
        onRequestTerminalMode?.();
        broadcastCommandToPanes(text);
      },
      runSavedCommand: (profileId: string, command: string, broadcast: boolean) => {
        onRequestTerminalMode?.();
        void runSavedCommand(profileId, command, broadcast);
      },
      newWorktreePane: () => {
        onRequestTerminalMode?.();
        openWorktreeDialog();
      },
      openCommandHistory: () => {
        onRequestTerminalMode?.();
        setCommandHistoryOpen(true);
      },
    }),
    [
      addPane,
      openExternal,
      sidebarForest,
      broadcastCommandToPanes,
      runSavedCommand,
      onRequestTerminalMode,
      openWorktreeDialog,
    ],
  );

  // Skip the default Profiles mirror workspace so Ctrl+1–9 follows the sidebar.
  const paletteGroupId = preferredVisibleGroupId(sidebarForest, [
    selectedGroupId,
    activeProfile?.workspaceId,
    sidebarForest?.lastActiveGroupId,
  ]);

  const terminalCommands = useTerminalCommands(
    t,
    data,
    sidebarForest,
    activeProfile?.id ?? null,
    {
      currentGroupId: paletteGroupId,
      paneCount: panes.length,
      savedCommands: activeProfile?.savedCommands ?? [],
    },
    paletteActions,
  );

  useEffect(() => {
    onRegisterCommands?.(terminalCommands);
  }, [terminalCommands, onRegisterCommands]);

  const profileLabel = activeProfile?.name ?? null;

  function handleProfileDeleted(profileId: string) {
    discardProfileSessions(profileId);
    if (activeProfile?.id !== profileId) return;
    setLayout(null);
    setFocusedPaneId(null);
    setBroadcastInput(false);
  }

  const sidebarGroups = useMemo(
    () => (sidebarForest?.groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        profileCount: g.profiles.length,
        agentAttention: strongestAttention(g.profiles.map((p) => backgroundAttention[p.id]?.kind)),
      })),
    [sidebarForest, backgroundAttention],
  );
  const currentGroupId = paletteGroupId ?? "";
  const currentGroup =
    sidebarForest?.groups.find((g) => g.id === currentGroupId) ?? sidebarForest?.groups[0] ?? null;
  const profileMotion = useSlideDirection(activeProfile?.id ?? null, currentGroup?.profiles ?? NO_SLIDE_ITEMS);
  const profileStageClass = slideClassName(profileMotion.direction, "profile-stage", profileMotion.epoch);
  const profileBadgeClass = slideClassName(profileMotion.direction, "profile-slide", profileMotion.epoch);
  const allProfiles = useMemo(
    () => sidebarForest?.groups.flatMap((g) => g.profiles) ?? [],
    [sidebarForest],
  );
  /** Switch to a background profile and focus the pane (notification / toast click). */
  const openBackgroundPaneRef = useRef(async (_profileId: string, _paneId: string) => {});
  openBackgroundPaneRef.current = async (profileId: string, paneId: string) => {
    const profile = allProfiles.find((p) => p.id === profileId);
    if (!profile) return;
    await restorePaneToDisplay(profile, paneId);
  };
  const openBackgroundToast = useCallback(
    (toast: BackgroundAgentToast) => {
      dismissBackgroundToast(toast.id);
      void openBackgroundPaneRef.current(toast.profileId, toast.paneId);
    },
    [dismissBackgroundToast],
  );

  const settingsProfile = useMemo(
    () => allProfiles.find((p) => p.id === settingsProfileId) ?? null,
    [allProfiles, settingsProfileId],
  );
  const sidebarProfiles = useMemo(
    () =>
      (currentGroup?.profiles ?? []).map((p) => {
        const live = getProfilePanes(p.id);
        const liveLabels = paneDisplayLabels(live);
        const isActive = p.id === activeProfile?.id;
        const terminals =
          live.length > 0
            ? live.map((pane, idx) => ({
                id: pane.id,
                profileId: p.id,
                tool: pane.tool,
                label: liveLabels[pane.id] ?? paneDisplayLabel(pane),
                description: pane.cwd || `${paneToolLabel(pane.tool)} ${idx + 1}`,
                live: true,
                minimized: isActive ? isPaneMinimized(p.id, pane.id) : false,
                agentAttention: isActive ? null : (backgroundPaneAttention[pane.id]?.kind ?? null),
                agentStatus: paneAgentStates[pane.id] ?? null,
              }))
            : shouldShowSavedTerminalPreview(live.length, isActive)
              ? p.terminals.map((terminal, idx) => ({
                  id: `saved-${p.id}-${idx}`,
                  profileId: p.id,
                  tool: terminal.tool,
                  label: terminal.title?.trim() || `${paneToolLabel(terminal.tool)} ${idx + 1}`,
                  description: terminal.cwd,
                  live: false,
                }))
              : [];
        return {
          id: p.id,
          name: p.name,
          defaultTool: isPlainShellTool(resolveInstalledLaunchTool(p.defaultTool, data))
            ? undefined
            : p.defaultTool,
          accentColor: p.accentColor,
          terminalCount: terminals.length,
          broadcastInput: p.broadcastInput,
          savedCommands: p.savedCommands ?? [],
          terminals,
          agentAttention: isActive ? null : (backgroundAttention[p.id] ?? null),
          agentStatus: strongestPaneAgentStatus(live.map((pane) => paneAgentStates[pane.id])),
        };
      }),
    [
      paneAgentStates,
      backgroundAttention,
      backgroundPaneAttention,
      currentGroup?.profiles,
      getProfilePanes,
      activeProfile?.id,
      isPaneMinimized,
      layout,
      minimizedPaneIds,
      data,
    ],
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

  const { focusPreviousTerminal } = useTerminalFocusMru({
    activeProfile,
    focusedPaneId,
    enabled: active && !profileBusy && !restoring,
    isPaneLive: (ref) => isPaneLive(ref.workspaceId, ref.profileId, ref.paneId),
    onActivate: async (ref) => {
      // ProfileForest.groups[].id === DB workspace id === ProfileInfo.workspaceId
      setSelectedGroupId(ref.workspaceId);
      await restorePaneToDisplayById(ref.profileId, ref.paneId);
    },
  });

  usePaneShortcuts({
    panes: dockedPanes,
    focusedPaneId,
    // layout may be null on an empty workspace — Ctrl+Tab MRU must still run
    // so focus can return to a live terminal in another workspace/profile.
    enabled: active && !profileBusy && !restoring,
    onFocusPane: (paneId) => {
      if (activeProfile) focusPaneInDisplay(activeProfile.id, paneId);
      else setFocusedPaneId(paneId);
    },
    onFocusRecentTerminal: () => {
      void focusPreviousTerminal();
    },
    onClosePane: closePane,
    onClearPane: clearPaneScreen,
    onRestartPane: (id) => void respawnPane(id),
    onSplitPane: (id, dir) => void splitPane(id, dir),
    onToggleMaximizePane: toggleMaximizePane,
    onFontZoom: (direction) => {
      const next = zoomFontSize(settings.terminalFontSize, direction, DEFAULT_TERMINAL_FONT_SIZE);
      if (next !== settings.terminalFontSize) updateSettings({ terminalFontSize: next });
    },
    onOpenCommandHistory: () => setCommandHistoryOpen(true),
    // Neighbours and dividers come from the visible tree (minimized / popped-out panes excluded);
    // the change lands in `layout`, which persists like a mouse drag.
    onSwapPane: (paneId, direction) => {
      if (!shownLayout) return;
      const other = findPaneInDirection(shownLayout, paneId, direction);
      if (!other) return;
      setLayout((prev) => (prev ? swapPaneLeaves(prev, paneId, other) : prev));
    },
    onResizePane: (paneId, direction) => {
      if (!shownLayout) return;
      const next = resizePaneInDirection(shownLayout, paneId, direction);
      if (next === shownLayout) return;
      setLayout((prev) => (prev ? copySplitRatios(prev, next) : prev));
    },
    onEqualizePanes: () => {
      if (!shownLayout) return;
      const next = equalizeAllSplits(shownLayout);
      setLayout((prev) => (prev ? copySplitRatios(prev, next) : prev));
    },
  });

  // --- Profile view windows -------------------------------------------------
  /** Active-profile panes in view windows (listed when nothing else is on screen). */
  const poppedOutShown = useMemo(
    () => (poppedOutPaneIds.size === 0 ? [] : panes.filter((p) => poppedOutPaneIds.has(p.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, poppedOutPaneIds],
  );

  const lookupProfilePane = useCallback(
    (profileKey: string, paneId: string): PaneInfo | null =>
      findPane(getProfileLayoutByKey(profileKey), paneId),
    [getProfileLayoutByKey],
  );

  const profileByKey = useCallback(
    (profileKey: string): ProfileInfo | null => {
      if (activeProfile && profileKeyOf(activeProfile) === profileKey) return activeProfile;
      const i = profileKey.indexOf(":");
      const workspaceId = profileKey.slice(0, i);
      const profileId = profileKey.slice(i + 1);
      return (
        allProfiles.find((p) => p.id === profileId && p.workspaceId === workspaceId) ??
        allProfiles.find((p) => p.id === profileId) ??
        null
      );
    },
    [activeProfile, allProfiles],
  );

  // Panes closed / restarted in the profile: drop them from views (or pick up the new session).
  useEffect(() => {
    if (restoring || profileBusy) return;
    const next = resolveViews(views, lookupProfilePane);
    if (next !== views) setViews(next);
  }, [views, layout, backgroundProfilePanes, restoring, profileBusy, lookupProfilePane, setViews]);

  // Keep the per-machine view store in step with every view change (any profile).
  // Deduped per key: focus / re-resolve churn must not rewrite the file.
  const savedViewKeysRef = useRef(new Set<string>());
  const lastSavedViewsRef = useRef(new Map<string, string>());
  useEffect(() => {
    const keys = new Set([...savedViewKeysRef.current, ...views.map((v) => v.profileKey)]);
    for (const key of keys) {
      const tree = getProfileLayoutByKey(key);
      if (!tree) continue;
      const saved = serializeViews(
        views.filter((v) => v.profileKey === key),
        tree,
      );
      const json = JSON.stringify(saved);
      if (lastSavedViewsRef.current.get(key) === json) continue;
      lastSavedViewsRef.current.set(key, json);
      void window.api.paneViewStoreSave(viewStoreKey(key), saved);
    }
    savedViewKeysRef.current = new Set(views.map((v) => v.profileKey));
  }, [views, getProfileLayoutByKey]);

  // A pane moved into a view must not stay focused here.
  useEffect(() => {
    if (!focusedPaneId || !poppedOutPaneIds.has(focusedPaneId)) return;
    const hidden = new Set([...minimizedPaneIds, ...poppedOutPaneIds]);
    setFocusedPaneId(focusAfterPopOut(layoutRef.current, hidden, focusedPaneId, focusedPaneId));
  }, [focusedPaneId, poppedOutPaneIds, minimizedPaneIds]);

  // Declare every view to main, which opens / updates / closes the windows to match.
  const lastViewSyncRef = useRef("");
  useEffect(() => {
    const decls: PaneViewDecl[] = views.map((v) => {
      const profile = profileByKey(v.profileKey);
      const labels: Record<string, string> = {};
      const busy: Record<string, boolean> = {};
      for (const pane of collectPanes(v.layout)) {
        labels[pane.id] = paneLabels[pane.id] ?? paneDisplayLabel(pane);
        const status = paneAgentStates[pane.id];
        busy[pane.id] = Boolean(status && isPaneAgentBusy(status));
      }
      return {
        viewId: v.id,
        profileKey: v.profileKey,
        profileName: profile?.name ?? "",
        accentColor: profile?.accentColor ?? null,
        layout: v.layout,
        focusedPaneId: v.focusedPaneId,
        labels,
        busy,
        bounds: v.bounds,
      };
    });
    const serialized = JSON.stringify(decls);
    if (serialized === lastViewSyncRef.current) return;
    lastViewSyncRef.current = serialized;
    window.api.paneViewSync(decls);
  }, [views, profileByKey, paneLabels, paneAgentStates]);

  /** Drag released off this window, or "Open in new window": main decides, then sends a move intent. */
  function popOutPane(paneId: string, trigger: PanePopOutTrigger, size?: PanePopOutSize) {
    if (!activeProfile || !layoutRef.current || !findPane(layoutRef.current, paneId)) return;
    let paneSize = size;
    if (!paneSize) {
      const rect = document
        .querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(paneId)}"]`)
        ?.getBoundingClientRect();
      if (rect) paneSize = { width: rect.width, height: rect.height };
    }
    void window.api.paneViewDragEnd({
      paneId,
      profileKey: profileKeyOf(activeProfile),
      profileName: activeProfile.name,
      trigger,
      width: paneSize?.width,
      height: paneSize?.height,
    });
  }

  /** Show a pane that just left a view here again (switching profile when needed). */
  function focusDockedPane(profileKey: string, paneId: string) {
    if (activeProfileKey === profileKey) {
      if (activeProfile) focusPaneInDisplay(activeProfile.id, paneId);
      else setFocusedPaneId(paneId);
      return;
    }
    const profile = profileByKey(profileKey);
    if (profile) void openBackgroundPaneRef.current(profile.id, paneId);
  }

  function dockPane(paneId: string) {
    const view = findViewOfPane(viewsRef.current, paneId);
    if (!view) return;
    setViews((prev) => removePaneFromViews(prev, paneId));
    focusDockedPane(view.profileKey, paneId);
  }

  /** Close a pane wherever its profile is (active layout or stashed). */
  function closeProfilePane(profileKey: string, paneId: string) {
    if (activeProfileKey === profileKey && layoutRef.current && findPane(layoutRef.current, paneId)) {
      performClosePane(paneId);
      return;
    }
    closePaneInStashedProfile(paneId, (workspaceId, profileId) =>
      profileByKey(`${workspaceId}:${profileId}`),
    );
  }

  /** Same array back when `fn` changes nothing (keeps syncs / store writes quiet). */
  function updateView(viewId: string, fn: (view: PaneView) => PaneView) {
    setViews((prev) => {
      let changed = false;
      const next = prev.map((v) => {
        if (v.id !== viewId) return v;
        const updated = fn(v);
        if (updated !== v) changed = true;
        return updated;
      });
      return changed ? next : prev;
    });
  }

  const handleViewIntentRef = useRef((_intent: PaneViewIntent) => {});
  handleViewIntentRef.current = (intent: PaneViewIntent) => {
    if (intent.type === "move") {
      const { paneId, fromViewId, target } = intent;
      const fromView = fromViewId ? viewsRef.current.find((v) => v.id === fromViewId) : null;
      if (fromViewId && !fromView) return;
      const profileKey = fromView ? fromView.profileKey : activeProfileKey;
      if (!profileKey) return;
      const pane = lookupProfilePane(profileKey, paneId);
      if (!pane) return;
      if (target.kind === "dock") {
        dockPane(paneId);
        return;
      }
      if (target.kind === "into-view") {
        const into = viewsRef.current.find((v) => v.id === target.viewId);
        // Main checks this too: a view only ever holds panes of its own profile.
        if (!into || into.profileKey !== profileKey) return;
        setViews((prev) =>
          removePaneFromViews(prev, paneId).map((v) =>
            v.id === into.id ? addPaneToView(v, pane) : v,
          ),
        );
        return;
      }
      setViews((prev) => [
        ...removePaneFromViews(prev, paneId),
        {
          id: newViewId(),
          profileKey,
          layout: { kind: "pane", pane },
          focusedPaneId: paneId,
          bounds: target.bounds,
        },
      ]);
      return;
    }

    const view = viewsRef.current.find((v) => v.id === intent.viewId);
    if (!view) return;
    const { action } = intent;
    switch (action.type) {
      case "focus":
        updateView(view.id, (v) =>
          v.focusedPaneId === action.paneId ? v : { ...v, focusedPaneId: action.paneId },
        );
        return;
      case "close-pane":
        closeProfilePane(view.profileKey, action.paneId);
        return;
      case "dock-pane":
        dockPane(action.paneId);
        return;
      case "dock-all": {
        const first = viewPaneIds(view)[0];
        setViews((prev) => prev.filter((v) => v.id !== view.id));
        if (first) focusDockedPane(view.profileKey, first);
        return;
      }
      case "close-view":
        for (const paneId of viewPaneIds(view)) closeProfilePane(view.profileKey, paneId);
        setViews((prev) => prev.filter((v) => v.id !== view.id));
        return;
      case "move-in-view":
        updateView(view.id, (v) => ({
          ...v,
          layout: movePaneInTree(v.layout, action.dragPaneId, action.targetPaneId, action.zone),
        }));
        return;
      case "resize":
        updateView(view.id, (v) => ({
          ...v,
          layout: updateSplitRatio(v.layout, action.splitId, action.ratio),
        }));
        return;
      case "cwd":
        reportPaneCwd(action.sessionId, action.cwd);
        return;
      case "title":
        reportPaneTitle(action.sessionId, action.title);
        return;
      case "bounds":
        updateView(view.id, (v) => ({ ...v, bounds: action.bounds }));
        return;
    }
  };
  useEffect(() => window.api.onPaneViewIntent((intent) => handleViewIntentRef.current(intent)), []);
  /** History panel "save": append to the active profile's saved commands. */
  const saveCommandToProfile = async (command: string): Promise<SaveCommandResult> => {
    const profile = activeProfile;
    if (!profile) return "error";
    const existing = profile.savedCommands ?? [];
    const text = command.trim();
    if (existing.some((s) => s.command.trim() === text)) return "exists";
    const snippet = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: savedCommandNameFor(text),
      command: text,
    };
    const r = await window.api.profileUpdate(profile.id, { savedCommands: [...existing, snippet] });
    if (!r.success) return "error";
    if (r.profile) syncActiveProfile(r.profile);
    await refreshSidebarForest();
    return "saved";
  };

  const sidebarColumnStyle: CSSProperties = {
    width: sidebarCollapsed ? SIDEBAR_RAIL_WIDTH : sidebarWidth,
    transition: sidebarAnimating ? `width ${SIDEBAR_MOTION_MS}ms ${SIDEBAR_EASE}` : undefined,
  };
  const sidebarGutterStyle: CSSProperties = {
    width: sidebarCollapsed ? 0 : SIDEBAR_GUTTER_WIDTH,
    transition: sidebarAnimating ? `width ${SIDEBAR_MOTION_MS}ms ${SIDEBAR_EASE}` : undefined,
  };

  const sidebar = (
    <div
      data-sidebar-column
      className={`relative h-full min-w-0 shrink-0 ${sidebarAnimating ? "overflow-hidden" : "overflow-visible"}`}
      style={sidebarColumnStyle}
    >
      <div className="h-full" style={{ width: sidebarAnimating ? sidebarWidth : "100%" }}>
      <Sidebar
        groups={sidebarGroups}
        currentGroupId={currentGroupId}
        profiles={sidebarProfiles}
        activeProfileId={activeProfile?.id ?? null}
        activeTerminalId={focusedPaneId}
        collapsed={sidebarContentCollapsed}
        onGroupChange={(groupId) => {
          setSelectedGroupId(groupId);
          const group = sidebarForest?.groups.find((g) => g.id === groupId);
          if (!group || group.profiles.length === 0) return;
          const rememberedId =
            lastActiveByGroupRef.current[groupId] ?? sidebarForest?.lastActiveByGroup?.[groupId];
          const remembered =
            (rememberedId && group.profiles.find((p) => p.id === rememberedId)) || null;
          const target = remembered ?? group.profiles[0]!;
          void handleActivateProfile(target);
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
          setPendingDeleteGroup({ id: group.id, name: group.name });
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
        onProfileMoveToGroup={(profileId, targetGroupId) => {
          const profile = allProfiles.find((p) => p.id === profileId);
          if (!profile || profile.workspaceId === targetGroupId) return;
          void (async () => {
            if (profile.id === activeProfile?.id) {
              await flushPersistCurrentProfile();
            }
            const r = await window.api.profileUpdate(profileId, { groupId: targetGroupId });
            if (!r.success) {
              window.alert(r.error ?? t("profile.failedSave"));
              return;
            }
            if (r.profile) {
              remapProfileWorkspace(profileId, profile.workspaceId, r.profile.workspaceId);
              syncActiveProfile(r.profile);
              if (r.profile.id === activeProfile?.id) {
                updateSettings({ workingDir: r.profile.defaultCwd?.trim() ?? "" });
                setBroadcastInput(r.profile.broadcastInput ?? false);
                setSelectedGroupId(targetGroupId);
              }
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
        onSavedCommandRun={(profileId, command, broadcast) => {
          void runSavedCommand(profileId, command, broadcast);
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
      <button
        type="button"
        title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        aria-expanded={!sidebarCollapsed}
        onClick={() => commitSidebarCollapsed(!sidebarCollapsed)}
        className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-lg text-chrome-text-muted transition-colors duration-200 hover:bg-chrome-hover hover:text-chrome-text"
      >
        <ChevronLeft
          className="h-4 w-4"
          style={{
            transform: sidebarCollapsed ? "rotate(180deg)" : undefined,
            transition: `transform ${SIDEBAR_MOTION_MS}ms ${SIDEBAR_EASE}`,
          }}
        />
      </button>
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
        onCreate={async (opts) => {
          const r = await window.api.profileCreate(opts.name, {
            groupId: opts.groupId,
            defaultCwd: opts.defaultCwd || undefined,
            defaultTool: opts.defaultTool,
            accentColor: opts.accentColor,
            broadcastInput: opts.broadcastInput,
            remote: opts.remote,
            copyFromProfileId: opts.copyFromProfileId,
          });
          // Failure keeps the dialog open with the reason (it used to close silently).
          if (!r.success || !r.profile) return r.error ?? t("profile.failedCreate");
          setCreateProfileOpen(false);
          setSelectedGroupId(opts.groupId);
          void (async () => {
            await handleActivateProfile(r.profile!);
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
        profileGroups={(sidebarForest?.groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
        availableTools={availableTools}
        inventoryScanning={inventoryScanning}
        busy={settingsBusy}
        onClose={() => setSettingsProfileId(null)}
        onSave={async (profileId: string, patch: ProfileSettingsPatch) => {
          setSettingsBusy(true);
          const previousWorkspaceId = settingsProfile?.workspaceId;
          if (previousWorkspaceId && patch.groupId && patch.groupId !== previousWorkspaceId) {
            await flushPersistCurrentProfile();
          }
          const r = await window.api.profileUpdate(profileId, patch);
          setSettingsBusy(false);
          if (!r.success) return r.error ?? t("profile.failedSave");
          if (r.profile) {
            if (previousWorkspaceId && r.profile.workspaceId !== previousWorkspaceId) {
              remapProfileWorkspace(profileId, previousWorkspaceId, r.profile.workspaceId);
              setSelectedGroupId(r.profile.workspaceId);
            }
            syncActiveProfile(r.profile);
            if (r.profile.id === activeProfile?.id) {
              updateSettings({ workingDir: r.profile.defaultCwd?.trim() ?? "" });
              setBroadcastInput(r.profile.broadcastInput ?? false);
            }
          }
          setSettingsProfileId(null);
          await refreshSidebarForest();
        }}
        onDelete={(profile) => {
          setPendingDeleteProfile(profile);
        }}
      />
      <GitWorktreeDialog
        open={worktreePaneId !== null}
        cwd={(worktreePaneId ? panes.find((p) => p.id === worktreePaneId)?.cwd : null) ?? ""}
        onClose={() => setWorktreePaneId(null)}
        onCreated={openWorktreePane}
      />
      <CommandHistoryPanel
        open={commandHistoryOpen}
        onClose={() => setCommandHistoryOpen(false)}
        // Panes in a view window take input only there (re-run would be dropped).
        panes={dockedPanes}
        focusedPaneId={focusedPaneId}
        broadcastCount={broadcastActive ? dockedPanes.length : 1}
        onFocusPane={(paneId) => {
          if (activeProfile) focusPaneInDisplay(activeProfile.id, paneId);
          else setFocusedPaneId(paneId);
        }}
        onRerun={(sessionId, command) => handlePtyWrite(`${command}\r`, sessionId)}
        onSave={activeProfile ? saveCommandToProfile : undefined}
      />
      <BusyPaneCloseDialog
        open={busyClosePaneId !== null}
        onCancel={() => setBusyClosePaneId(null)}
        onConfirm={() => {
          const paneId = busyClosePaneId;
          setBusyClosePaneId(null);
          if (paneId) performClosePane(paneId);
        }}
      />
      <ConfirmDialog
        open={pendingDeleteGroup !== null}
        title={t("profileGroup.deleteTitle")}
        description={t("profileGroup.deleteConfirm", { name: pendingDeleteGroup?.name ?? "" })}
        confirmLabel={t("profileGroup.deleteAction")}
        confirmVariant="destructive"
        onCancel={() => setPendingDeleteGroup(null)}
        onConfirm={() => {
          const group = pendingDeleteGroup;
          setPendingDeleteGroup(null);
          if (!group) return;
          void (async () => {
            await window.api.profileGroupDelete(group.id);
            await refreshSidebarForest();
          })();
        }}
      />
      <ConfirmDialog
        open={pendingDeleteProfile !== null}
        title={t("profile.deleteTitle")}
        description={t("profile.deleteConfirm", { name: pendingDeleteProfile?.name ?? "" })}
        confirmLabel={t("profile.deleteAction")}
        confirmVariant="destructive"
        onCancel={() => setPendingDeleteProfile(null)}
        onConfirm={() => {
          const profile = pendingDeleteProfile;
          setPendingDeleteProfile(null);
          if (!profile) return;
          void (async () => {
            setSettingsBusy(true);
            await window.api.profileDelete(profile.id);
            setSettingsBusy(false);
            handleProfileDeleted(profile.id);
            setSettingsProfileId(null);
            await refreshSidebarForest();
          })();
        }}
      />
    </>
  );

  const topBar = (
    <WarpTopBar
      embedded={Boolean(titleBarSlot)}
      profileKey={activeProfile?.id ?? null}
      profileEnterClass={profileBadgeClass}
      profileLabel={profileLabel}
      profileAccentColor={activeProfile?.accentColor ?? null}
      paneCount={panes.length}
      maxPanes={maxPanes}
      canAddPane={canAddPane}
      restoring={profileBusy || restoring}
      onAddPane={(tool) => void addPane(tool)}
      onOpenFolder={() => void openFolderPane()}
      available={data.filter((e) => e.available)}
      splitShortcutLabels={{
        splitRight: paneShortcutLabels.splitRight ?? t("keybindings.unbound"),
        splitDown: paneShortcutLabels.splitDown ?? t("keybindings.unbound"),
      }}
    />
  );

  const emptyStateTool = resolveInstalledLaunchTool(activeProfile?.defaultTool, data);
  const terminalArea = (
    <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${profileStageClass}`}>
      {layout ? (
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
      {shownLayout ? (
      <SplitPaneLayout
        node={shownLayout}
        focusedPaneId={focusedPaneId}
        bg={bg}
        sidebarPaneDragActive={profileSidebarDrag}
        profileAccentColor={activeProfile?.accentColor ?? null}
        broadcastActive={broadcastActive}
        broadcastPaneCount={dockedPanes.length}
        paneAgentStates={paneAgentStates}
        paneLabels={paneLabels}
        maximizedPaneId={shownMaximizedPaneId}
        onToggleMaximizePane={toggleMaximizePane}
        maximizeShortcutKeys={paneShortcutLabels.toggleMaximize}
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
        onPaneBranchClick={openWorktreeDialog}
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
        onPopOutPane={(paneId, trigger, size) => popOutPane(paneId, trigger, size)}
        renderTerminal={(pane, paneFocused) => (
          <EmbeddedTerminal
            key={pane.sessionId}
            sessionId={pane.sessionId}
            bg={useAppThemeBg ? undefined : settings.terminalBg}
            fontFamily={terminalFontFamily}
            fontSize={terminalFontSize}
            scrollback={terminalScrollback}
            webglEnabled={settings.terminalWebglEnabled}
            rightClickPaste={settings.terminalRightClickPaste}
            copyOnSelect={settings.terminalCopyOnSelect}
            pasteConfirm={pasteConfirm}
            getPasteTargets={getPasteTargets}
            osc52Mode={settings.terminalOsc52}
            // Hidden behind a maximized pane: becoming active again refits xterm.
            active={active && (!shownMaximizedPaneId || shownMaximizedPaneId === pane.id)}
            focused={paneFocused}
            onWrite={handlePtyWrite}
            onCwdReport={reportPaneCwd}
            onTitleReport={reportPaneTitle}
            cwd={pane.cwd}
            onTerminalNotify={handleTerminalNotify}
            onSessionLost={() => {
              if (respawningPaneIdsRef.current.has(pane.id)) return;
              void respawnPane(pane.id);
            }}
            onRestart={() => void respawnPane(pane.id)}
            onNewConversation={
              pane.agentSessionId
                ? () => void respawnPane(pane.id, { newConversation: true })
                : undefined
            }
            onNewWorktreePane={() => openWorktreeDialog(pane.id)}
            onOpenInNewWindow={() => popOutPane(pane.id, "menu")}
            onExit={() => closePane(pane.id, { skipConfirm: true })}
          />
        )}
      />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-chrome-border-subtle px-4 py-6 text-center text-[12px] text-chrome-text-dim">
          {poppedOutShown.length > 0 ? (
            <>
              <p>{t("pane.popout.allPoppedOut")}</p>
              <div className="flex max-w-md flex-col gap-1.5">
                {poppedOutShown.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-chrome-border-subtle bg-chrome-surface px-3 py-2 text-left text-[12px] text-chrome-text-secondary"
                  >
                    <ToolLogo tool={p.tool} size={14} />
                    <span className="min-w-0 truncate">{paneLabels[p.id] ?? paneDisplayLabel(p)}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void window.api.paneViewFocus(p.id)}
                        className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-chrome-accent-text hover:bg-chrome-hover-strong"
                      >
                        {t("pane.popout.show")}
                      </button>
                      <button
                        type="button"
                        onClick={() => dockPane(p.id)}
                        className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-chrome-accent-text hover:bg-chrome-hover-strong"
                      >
                        {t("pane.popout.dockHere")}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p>{t("chat.allTerminalsMinimized")}</p>
              <p className="text-[11px]">{t("chat.selectTerminalFromSidebar")}</p>
            </>
          )}
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
        <EmptyState
          tone="chrome"
          bordered
          icon={
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chrome-ui-accent-soft">
              <SquareTerminal aria-hidden className="h-7 w-7 text-chrome-ui-accent" />
            </span>
          }
          title={t("chat.emptyPanes.title", { profile: profileLabel ?? activeProfile.name })}
          description={
            restoring || profileBusy ? (
              t("chat.restoring")
            ) : (
              <>
                {t("chat.emptyPanes.desc", { max: maxPanes })}
                {terminalError && (
                  <span className="mt-2 block text-[12px] text-fail">{terminalError}</span>
                )}
              </>
            )
          }
          action={
            <div className="flex flex-col items-center gap-4">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="chromeSolid"
                  disabled={!canAddPane || restoring || profileBusy}
                  onClick={() => void addPane(emptyStateTool)}
                >
                  {isPlainShellTool(emptyStateTool) ? (
                    <SquareTerminal aria-hidden />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90">
                      <ToolLogo tool={emptyStateTool} size={12} />
                    </span>
                  )}
                  {isPlainShellTool(emptyStateTool)
                    ? t("chat.emptyPanes.openShell")
                    : t("chat.emptyPanes.openTool", { tool: toolLabel(emptyStateTool) })}
                </Button>
                <Button
                  variant="chromeOutline"
                  disabled={!canAddPane || restoring || profileBusy}
                  onClick={() => void openFolderPane()}
                  title={t("chat.pickFolderPane")}
                >
                  <FolderOpen />
                  {t("chat.emptyPanes.pickFolder")}
                </Button>
              </div>
              <dl className="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-1.5 text-[12px] text-chrome-text-muted">
                {[
                  { keys: paneShortcutLabels.splitRight, label: t("shortcuts.pane.splitHorizontal") },
                  { keys: paneShortcutLabels.focusNext, label: t("shortcuts.pane.focusNext") },
                  {
                    keys: paneShortcutLabels.commandPalette,
                    label: t("shortcuts.general.commandPalette"),
                  },
                ]
                  .filter((row) => row.keys)
                  .map((row) => (
                    <Fragment key={row.label}>
                      <dt className="text-right">
                        <kbd className="rounded border border-chrome-border-subtle bg-chrome-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-chrome-text-secondary">
                          {row.keys}
                        </kbd>
                      </dt>
                      <dd className="text-left">{row.label}</dd>
                    </Fragment>
                  ))}
              </dl>
              <button
                type="button"
                onClick={openShortcutCheatsheet}
                className="cursor-pointer text-[12px] text-chrome-accent-text underline-offset-2 hover:underline"
              >
                {t("shortcuts.openLink")}
              </button>
            </div>
          }
        />
      ) : (
        <EmptyState
          tone="chrome"
          icon={
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chrome-ui-accent-soft">
              <Hand aria-hidden className="h-7 w-7 text-chrome-ui-accent" />
            </span>
          }
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
    )}
    {profileStageClass ? (
      <div
        key={profileMotion.epoch}
        aria-hidden
        className="profile-switch-wash pointer-events-none absolute inset-0 z-30"
        style={{
          background: activeProfile?.accentColor
            ? `linear-gradient(100deg, ${activeProfile.accentColor}38, transparent 62%)`
            : "linear-gradient(100deg, color-mix(in srgb, var(--color-chrome-ui-accent) 22%, transparent), transparent 62%)",
        }}
      />
    ) : null}
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 overflow-hidden bg-chrome-bg text-chrome-text" data-surface="chrome">
        {sidebarDialogs}
        {sidebar}
        <BackgroundAgentToasts
          toasts={backgroundToasts}
          onOpen={openBackgroundToast}
          onDismiss={dismissBackgroundToast}
        />
        <div
          className={`shrink-0 self-stretch overflow-hidden ${
            sidebarCollapsed || sidebarAnimating ? "pointer-events-none" : ""
          }`}
          style={sidebarGutterStyle}
          inert={sidebarCollapsed || sidebarAnimating}
        >
          <ResizeDivider
            mode="delta"
            orientation="horizontal"
            onResize={(delta) => {
              setSidebarMotionEpoch(0);
              setSidebarContentCollapsed(sidebarCollapsedRef.current);
              setSidebarWidth((w) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w + delta)));
            }}
          />
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          {titleBarSlot ? createPortal(topBar, titleBarSlot) : topBar}
          {terminalError && (
            <div className="shrink-0 border-b border-fail/30 bg-fail/15 px-3 py-2 text-[12px] text-fail">
              {terminalError}
            </div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{terminalArea}</div>
          <TerminalStatusBar pane={displayLayout ? focusedPane : null} />
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
    prev.onRequestTerminalMode === next.onRequestTerminalMode &&
    inventoryTerminalFingerprint(prev.data) === inventoryTerminalFingerprint(next.data)
  );
});

const PANES_LEFT_HINT_THRESHOLD = 2;
const NO_SLIDE_ITEMS: readonly { id: string }[] = [];

function WarpTopBar({
  profileKey = null,
  profileEnterClass = "",
  profileLabel,
  profileAccentColor = null,
  paneCount,
  maxPanes,
  canAddPane,
  restoring,
  onAddPane,
  onOpenFolder,
  available,
  splitShortcutLabels,
  embedded = false,
}: {
  /** Rendered inside the app title bar instead of as its own row. */
  embedded?: boolean;
  profileKey?: string | null;
  profileEnterClass?: string;
  profileLabel: string | null;
  profileAccentColor?: string | null;
  paneCount: number;
  maxPanes: number;
  canAddPane: boolean;
  restoring: boolean;
  onAddPane: (tool: string) => void;
  onOpenFolder: () => void;
  available: ProviderEntry[];
  splitShortcutLabels: { splitRight: string; splitDown: string };
}) {
  const { t } = useLocale();
  const accent = profileAccentColor;
  const hasAccent = Boolean(accent);
  const panesLeft = Math.max(0, maxPanes - paneCount);
  const limitTitle = t("chat.err.maxPanes", { max: maxPanes });
  // The title bar is 40px tall; the default `sm` button (36px) would crowd it.
  const buttonClass = embedded ? "min-h-7 px-2.5 text-[12px]" : undefined;

  return (
    <div
      className={
        embedded
          ? "flex min-w-0 flex-1 items-center gap-2 pl-1"
          : "relative z-40 flex h-10 shrink-0 items-center gap-2 overflow-visible border-b border-chrome-border bg-chrome-bg/95 px-3 backdrop-blur-sm"
      }
    >
      {profileLabel && (
        <div
          key={profileKey ?? profileLabel}
          className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 ${
            embedded ? "max-w-[220px] py-0.5" : "max-w-[280px] py-1"
          } ${profileEnterClass}`}
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
        </div>
      )}
      {restoring && <span className="text-[11px] text-chrome-text-subtle">{t("chat.restoringShort")}</span>}

      <div className={`ml-auto flex shrink-0 items-center gap-2 ${embedded ? "app-no-drag" : ""}`}>
        {panesLeft <= PANES_LEFT_HINT_THRESHOLD && (
          <span
            role="status"
            title={
              canAddPane
                ? t("chat.panesLeftTitle", { count: panesLeft, max: maxPanes })
                : limitTitle
            }
            className={`inline-flex items-center gap-1.5 text-[11px] tabular-nums ${
              canAddPane ? "text-chrome-text-subtle" : "text-chrome-accent-text"
            } ${embedded ? "max-lg:hidden" : ""}`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${canAddPane ? "bg-chrome-text-dim" : "bg-chrome-ui-accent"}`}
            />
            {canAddPane
              ? panesLeft === 1
                ? t("chat.panesLeftOne")
                : t("chat.panesLeft", { count: panesLeft })
              : t("chat.panesFull", { max: maxPanes })}
          </span>
        )}
        <span title={canAddPane ? undefined : limitTitle}>
          <Button
            variant="chromeOutline"
            size="sm"
            className={buttonClass}
            disabled={!canAddPane || restoring}
            onClick={onOpenFolder}
            title={canAddPane ? t("chat.pickFolderPane") : undefined}
          >
            <FolderOpen />
            {/* Narrow title bar: icon only, so "+ Pane" never slides under the caption buttons. */}
            <span className={embedded ? "max-lg:hidden" : undefined}>{t("chat.folderBtn")}</span>
          </Button>
        </span>
        <DropdownMenu>
          <span title={canAddPane ? undefined : limitTitle}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="chromeOutline"
                size="sm"
                className={buttonClass}
                disabled={!canAddPane}
                title={canAddPane ? t("chat.addPaneTitle", splitShortcutLabels) : undefined}
              >
                {t("chat.addPane")}
                <ChevronDown aria-hidden className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
          </span>
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
            {extBusy ? <WarmTypingDots tone="chrome" size="sm" /> : <Monitor />}
            {t("chat.externalBtn")}
          </Button>
          <Button variant="chromeSolid" className="w-full" disabled={inAppBusy} onClick={handleInApp}>
            {inAppBusy ? <WarmTypingDots tone="chrome" size="sm" /> : <Terminal />}
            {t("chat.inAppBtn")}
          </Button>
        </div>
      )}
    </div>
  );
}

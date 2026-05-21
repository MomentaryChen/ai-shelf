import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ProviderEntry, ProfileInfo } from "../types";
import { ToolLogo } from "./ToolLogo";
import { toolLabel } from "../utils";
import { AuthBadge } from "./Badge";
import { EmbeddedTerminal } from "./EmbeddedTerminal";
import { ProfileSidebar } from "./ProfileSidebar";
import { SplitPaneLayout } from "./SplitPaneLayout";
import { ResizeDivider } from "./ResizeDivider";
import { useProfileWorkspace } from "../hooks/useProfileWorkspace";
import { usePaneShortcuts } from "../hooks/usePaneShortcuts";
import { clearTerminalSession } from "../terminal/terminal-session-actions";
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
import { normalizePaneTitle } from "../utils/pane-label";
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

const SIDEBAR_WIDTH_KEY = "ai-inventory-sidebar-width";
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
  const [layout, setLayout] = useState<LayoutNode | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [broadcastInput, setBroadcastInput] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [addingTerminal, setAddingTerminal] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const initialRestoreDoneRef = useRef(false);
  const restoreInFlightRef = useRef(false);

  const panes = layout ? collectPanes(layout) : [];
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
      setTerminalError(`無法啟動 terminal（${tool}）：${msg}`);
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
      return spawnPane("shell", "");
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
      if (e.key === SETTINGS_KEY) setSettings(loadSettings());
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
    ) => {
      if (restoring) {
        setTerminalError("正在還原 profile，請稍候再試…");
        return false;
      }
      if (!canAddPane) {
        setTerminalError(`已達上限 ${maxPanes} 個 terminal，請先關閉一個 pane`);
        return false;
      }
      if (!window.api?.ptySpawn) {
        setTerminalError("Terminal API 未就緒，請重啟應用程式");
        return false;
      }

      const pane = await spawnPaneResilient(tool || "shell", resolveCwd(cwd));
      if (!pane) return false;

      setLayout((prev) => {
        if (!prev) return { kind: "pane", pane };
        const targetId = splitTargetId ?? focusedPaneId ?? collectPanes(prev)[0]?.id;
        if (!targetId) return { kind: "pane", pane };
        return splitPaneInTree(prev, targetId, direction, pane);
      });
      setFocusedPaneId(pane.id);
      return true;
    },
    [canAddPane, maxPanes, restoring, resolveCwd, spawnPaneResilient, focusedPaneId],
  );

  const respawnPaneWithCwd = useCallback(
    async (paneId: string, cwdOverride?: string) => {
      const victim = layout ? findPane(layout, paneId) : null;
      if (!victim) return;
      const cwd = cwdOverride?.trim() || victim.cwd || resolveCwd();
      window.api.ptyKill(victim.sessionId);
      const next = await spawnPaneResilient(victim.tool, cwd);
      if (!next) {
        setTerminalError(
          (prev) =>
            prev ??
            `Terminal session 已失效且無法重新啟動（${victim.tool}）。請關閉此 pane 後再按 + Terminal。`,
        );
        return;
      }
      setTerminalError(null);
      setLayout((prev) =>
        prev
          ? mapPanesInTree(prev, (p) =>
              p.id === paneId
                ? { ...next, id: paneId, cwd, title: victim.title }
                : p,
            )
          : prev,
      );
    },
    [layout, spawnPaneResilient, resolveCwd],
  );

  const respawnPane = useCallback(
    async (paneId: string) => {
      const victim = layout ? findPane(layout, paneId) : null;
      if (!victim) return;
      window.api.ptyKill(victim.sessionId);
      const next = await spawnPaneResilient(victim.tool, victim.cwd || resolveCwd());
      if (!next) {
        setTerminalError(
          (prev) =>
            prev ??
            `Terminal session 已失效且無法重新啟動（${victim.tool}）。請關閉此 pane 後再按 + Terminal。`,
        );
        return;
      }
      setTerminalError(null);
      setLayout((prev) =>
        prev
          ? mapPanesInTree(prev, (p) =>
              p.id === paneId
                ? { ...next, id: paneId, cwd: victim.cwd || next.cwd, title: victim.title }
                : p,
            )
          : prev,
      );
    },
    [layout, spawnPaneResilient, resolveCwd],
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
      const pane = layout ? findPane(layout, paneId) : null;
      if (!pane) return;
      const picked = await window.api.pickFolder(pane.cwd || resolveCwd() || undefined);
      if (!picked) return;
      recordDirHistory(picked);
      await respawnPaneWithCwd(paneId, picked);
    },
    [layout, resolveCwd, recordDirHistory, respawnPaneWithCwd],
  );

  const openFolderPane = useCallback(
    async (cwdHint?: string) => {
      if (restoring) {
        setTerminalError("正在還原 profile，請稍候再試…");
        return;
      }
      if (!canAddPane) {
        setTerminalError(`已達上限 ${maxPanes} 個 terminal，請先關閉一個 pane`);
        return;
      }
      const picked = await window.api.pickFolder(cwdHint?.trim() || resolveCwd() || undefined);
      if (!picked) return;
      recordDirHistory(picked);
      const tool = resolveLaunchTool(
        activeProfile?.defaultTool ?? availableTools[0],
        availableTools,
      );
      const ok = await addPane(tool, picked);
      if (!ok) {
        setTerminalError((prev) => prev ?? "無法開啟 terminal，請按 F12 查看 Console");
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

  const closePane = useCallback((paneId: string) => {
    setLayout((prev) => {
      if (prev) {
        const victim = collectPanes(prev).find((p) => p.id === paneId);
        if (victim) window.api.ptyKill(victim.sessionId);
      }
      return removePaneFromTree(prev, paneId);
    });
    setFocusedPaneId((prev) => (prev === paneId ? null : prev));
  }, []);

  const splitPane = useCallback(
    async (paneId: string, direction: SplitDirection) => {
      if (!canAddPane) return;
      const parent = layout ? collectPanes(layout).find((p) => p.id === paneId) : null;
      const tool = resolveLaunchTool(
        parent?.tool ?? availableTools[0],
        availableTools,
      );
      await addPane(tool, parent?.cwd || resolveCwd(), paneId, direction);
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
      setTerminalError(`無法啟用 profile：${msg}`);
      return undefined;
    } finally {
      setProfileBusy(false);
    }
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
      const ok = await addPane(
        resolveLaunchTool(profile.defaultTool, availableTools),
        cwd || undefined,
      );
      if (!ok) {
        setTerminalError((prev) => prev ?? "無法開啟 terminal，請按 F12 查看 Console");
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
        if (activeProfile?.id !== profile.id) {
          void handleActivateProfile(profile).then(() => setFocusedPaneId(paneId));
        } else {
          setFocusedPaneId(paneId);
        }
      }}
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
    />
  );

  const terminalArea = layout ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
      <div className="flex min-h-0 flex-1 flex-col">
      <SplitPaneLayout
        node={layout}
        focusedPaneId={focusedPaneId}
        bg={bg}
        profileAccentColor={activeProfile?.accentColor ?? null}
        onFocusPane={setFocusedPaneId}
        onClosePane={closePane}
        onRenamePane={renamePane}
        onSplitPane={(id, dir) => void splitPane(id, dir)}
        onPaneCwdClick={(paneId) => void changePaneCwd(paneId)}
        onResizeSplit={(splitId, ratio) =>
          setLayout((prev) => (prev ? updateSplitRatio(prev, splitId, ratio) : prev))
        }
        onMovePane={(dragPaneId, targetPaneId, zone) => {
          setLayout((prev) => (prev ? movePaneInTree(prev, dragPaneId, targetPaneId, zone) : prev));
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
            onSessionLost={() => void respawnPane(pane.id)}
            onRestart={() => void respawnPane(pane.id)}
            onExit={() => closePane(pane.id)}
          />
        )}
      />
      </div>
    </div>
  ) : (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 py-6">
      {activeProfile ? (
        <div className="rounded-lg border border-[#252525] bg-[#111111] px-4 py-3 text-[13px] text-[#8a8a8a]">
          Profile <span className="text-[#8ab4ff]">{profileLabel}</span>
          {restoring || profileBusy ? (
            <span className="ml-2">正在還原 terminal…</span>
          ) : (
            <span className="ml-2">
              — 點上方「+ Pane」開啟 terminal（最多 {maxPanes} 個，會自動記住）
            </span>
          )}
          {terminalError && (
            <p className="mt-2 text-[12px] text-red-400">{terminalError}</p>
          )}
          <p className="mt-2 text-[11px] text-[#505050]">
            窗格快捷鍵：<kbd className="rounded border border-[#333] px-1">Ctrl+Tab</kbd> 切換、{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+W</kbd> 關閉、{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+L</kbd> 清屏、{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+Shift+R</kbd> 重啟 session、{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+\\</kbd> /{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+Shift+\\</kbd> 分割、{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+1–9</kbd> 跳至第 N 窗格、{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+F</kbd> 搜尋輸出。
            右鍵選單亦可清屏／重啟。
          </p>
          <p className="mt-1 text-[11px] text-[#505050]">
            除錯：按 <kbd className="rounded border border-[#333] px-1">F12</kbd> 或{" "}
            <kbd className="rounded border border-[#333] px-1">Ctrl+Shift+I</kbd>
            開啟開發者工具；也可按 <kbd className="rounded border border-[#333] px-1">Alt</kbd>{" "}
            → View → Developer Tools
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-[#6b6b6b]">
          從左側選擇或建立 <strong className="text-[#a0a0a0]">Profile</strong>
          ，會自動還原上次的 terminal 視窗與預設目錄。
        </p>
      )}
      <div>
        {availableTools.length > 0 && (
          <>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[#6b6b6b]">
              可用的 Agent
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
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[#0a0a0a] text-[#e8e8e8]">
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
}) {
  const accent = profileAccentColor;
  const hasAccent = Boolean(accent);

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#1a1a1e] bg-[#0a0a0b]/95 px-3 backdrop-blur-sm">
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
                  backgroundColor: "rgba(126, 182, 255, 0.08)",
                  borderColor: "rgba(126, 182, 255, 0.2)",
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
            style={{ color: hasAccent && accent ? accent : "#8ab4ff" }}
          >
            {profileLabel}
          </span>
          {paneCount > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-[#6b6b72]">
              {paneCount}/{maxPanes}
              {broadcastInput && paneCount > 1 ? " · sync" : ""}
            </span>
          )}
        </div>
      )}
      {restoring && <span className="text-[11px] text-[#6b6b6b]">Restoring…</span>}
      <div ref={newMenuRef} className="relative ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={!canAddPane || restoring}
          onClick={onOpenFolder}
          title={
            canAddPane
              ? "選擇資料夾並開啟新窗格（獨立工作目錄）"
              : `Maximum ${maxPanes} panes`
          }
          className="cursor-pointer rounded-md border border-[#2a2a2a] px-2 py-1 text-[12px] text-[#a0a0a0] hover:border-[#404040] disabled:opacity-40"
        >
          📁 Folder
        </button>
        <button
          type="button"
          disabled={!canAddPane}
          onClick={onToggleNewMenu}
          title={
            canAddPane
              ? "Add terminal pane (Ctrl+\\ split right, Ctrl+Shift+\\ split down)"
              : `Maximum ${maxPanes} panes`
          }
          className="cursor-pointer rounded-md border border-[#2a2a2a] px-2.5 py-1 text-[12px] text-[#a0a0a0] hover:border-[#404040] disabled:opacity-40"
        >
          + Pane
        </button>
        {showNewMenu && canAddPane && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border border-[#2a2a2a] bg-[#141414] py-1 shadow-xl">
            {available.map((e) => (
              <button
                key={e.tool}
                type="button"
                onClick={() => {
                  onAddPane(e.tool);
                  onToggleNewMenu();
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-[12px] hover:bg-[#1f1f1f]"
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
  const [extBusy, setExtBusy] = useState(false);
  const [inAppBusy, setInAppBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleExternal() {
    if (!onExternal) return;
    setExtBusy(true);
    setErr("");
    const r = await onExternal();
    setExtBusy(false);
    if (!r.success) setErr(r.error ?? "Failed to launch terminal");
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
          ? "border-[#252525] bg-[#111111] opacity-50"
          : "border-[#252525] bg-[#141414] hover:border-[#404040]"
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]">
          <ToolLogo tool={entry.tool} size={28} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{toolLabel(entry.tool)}</span>
            {entry.version && <span className="text-[11px] text-[#6b6b6b]">v{entry.version}</span>}
          </div>
          <AuthBadge auth={disabled ? "missing" : entry.auth} />
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-[#8a8a8a]">
        {TOOL_DESCRIPTIONS[entry.tool] ?? "AI coding assistant"}
      </p>
      {err && <p className="rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{err}</p>}
      {disabled ? (
        <p className="text-center text-[13px] text-[#6b6b6b]">Not installed</p>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-3">
          <button
            disabled={extBusy}
            onClick={handleExternal}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#2a2a2a] py-2.5 text-[13px] disabled:opacity-50"
          >
            {extBusy ? <span className="animate-spin">⟳</span> : "🖥️"} External
          </button>
          <button
            disabled={inAppBusy}
            onClick={handleInApp}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#3d5a80] bg-[#1a2a40]/60 py-2.5 text-[13px] font-medium text-[#7eb8ff] disabled:opacity-50"
          >
            {inAppBusy ? <span className="animate-spin">⟳</span> : "⌨️"} In-App
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
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ExternalTerminal)}
      className="cursor-pointer rounded-md border border-[#2a2a2a] bg-[#111111] px-2 py-1 text-[12px] focus:outline-none"
    >
      {TERMINAL_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

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
import {
  collectPanes,
  findPane,
  mapPanesInTree,
  removePaneFromTree,
  splitPaneInTree,
  updateSplitRatio,
  type LayoutNode,
  type PaneInfo,
  type SplitDirection,
} from "../terminal/split-tree";
import {
  TERMINAL_OPTIONS,
  getAppBg,
  loadSettings,
  saveSettings,
  type ChatSettings,
  type ExternalTerminal,
  SETTINGS_KEY,
} from "../chat-settings";
import { toolIdsFromInventory } from "../utils/available-tools";

const SIDEBAR_WIDTH_KEY = "ai-inventory-sidebar-width";
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;

function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = raw ? Number(raw) : 240;
    if (!Number.isFinite(n)) return 240;
    return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
  } catch {
    return 240;
  }
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  claude: "Anthropic coding agent — context-rich, file-aware sessions",
  copilot: "GitHub Copilot CLI — explain, suggest and chat",
  cursor: "Cursor agent — AI pair programmer for your workspace",
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
      if (override) return override;
      if (settings.workingDir) return settings.workingDir;
      if (activeProfile?.defaultCwd) return activeProfile.defaultCwd;
      return "";
    },
    [settings.workingDir, activeProfile],
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
                ? { ...next, id: paneId, cwd: victim.cwd || next.cwd }
                : p,
            )
          : prev,
      );
    },
    [layout, spawnPaneResilient, resolveCwd],
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
      const tool = parent?.tool ?? data.find((e) => e.available)?.tool ?? "claude";
      await addPane(tool, parent?.cwd || resolveCwd(), paneId, direction);
    },
    [layout, data, addPane, canAddPane, resolveCwd],
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
      } else if (panes.length === 0) {
        const r = await handleActivateProfile(profile);
        if ((r?.paneCount ?? 0) > 0) return;
      }
      const ok = await addPane(profile.defaultTool || "shell");
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

  const availableTools = useMemo(() => toolIdsFromInventory(data), [data]);

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
      onAddTerminal={(profile) => void handleNewTerminal(profile)}
      addingTerminal={addingTerminal}
      onToggleBroadcast={(id, v) => void handleToggleBroadcast(id, v)}
      onUpdateDefaultCwd={(_id, cwd) => updateSettings({ workingDir: cwd })}
      onProfileDeleted={handleProfileDeleted}
    />
  );

  const topBar = (
    <WarpTopBar
      profileLabel={profileLabel}
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
        onFocusPane={setFocusedPaneId}
        onClosePane={closePane}
        onSplitPane={(id, dir) => void splitPane(id, dir)}
        onResizeSplit={(splitId, ratio) =>
          setLayout((prev) => (prev ? updateSplitRatio(prev, splitId, ratio) : prev))
        }
        renderTerminal={(pane, paneFocused) => (
          <EmbeddedTerminal
            key={pane.sessionId}
            sessionId={pane.sessionId}
            bg={bg}
            active={active}
            focused={paneFocused}
            onWrite={handlePtyWrite}
            onSessionLost={() => void respawnPane(pane.id)}
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
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[#6b6b6b]">
          Available tools
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
          {data.filter((e) => !e.available).map((e) => (
            <ToolCard key={e.tool} entry={e} disabled />
          ))}
        </div>
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
  available,
}: {
  profileLabel: string | null;
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
  available: ProviderEntry[];
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#1f1f1f] bg-[#0a0a0a] px-3">
      <input
        type="search"
        placeholder="Search…"
        className="min-w-0 max-w-md flex-1 rounded-md border border-[#252525] bg-[#111111] px-2.5 py-1 text-[12px] text-[#c0c0c0] placeholder:text-[#5a5a5a] focus:border-[#404040] focus:outline-none"
      />
      {profileLabel && (
        <span className="hidden max-w-[200px] truncate text-[11px] text-[#6b9fff] lg:inline" title={profileLabel}>
          {profileLabel}
          {paneCount > 0 && (
            <span className="ml-1 text-[#5a5a5a]">
              · {paneCount}/{maxPanes}
              {broadcastInput && paneCount > 1 ? " · 同步輸入" : ""}
            </span>
          )}
        </span>
      )}
      {restoring && <span className="text-[11px] text-[#6b6b6b]">Restoring…</span>}
      <div ref={newMenuRef} className="relative ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={!canAddPane}
          onClick={onToggleNewMenu}
          title={canAddPane ? "Add terminal pane" : `Maximum ${maxPanes} panes`}
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

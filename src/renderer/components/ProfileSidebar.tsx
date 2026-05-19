import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProfileInfo, ProfileTree } from "../types";
import { ToolLogo } from "./ToolLogo";
import { toolLabel } from "../utils";
import { profileToolLabel } from "../utils/available-tools";
import type { PaneInfo } from "../terminal/split-tree";
import { ProfileCreateDialog } from "./ProfileCreateDialog";
import {
  ProfileSettingsDialog,
  type ProfileSettingsPatch,
} from "./ProfileSettingsDialog";
import { profileRowAccentStyle } from "../utils/profile-colors";

interface Props {
  width?: number;
  activeProfileId: string | null;
  focusedPaneId: string | null;
  broadcastInput: boolean;
  availableTools: string[];
  inventoryScanning?: boolean;
  busy?: boolean;
  getProfilePanes: (profileId: string) => PaneInfo[];
  getProfileFocusedPaneId: (profileId: string) => string | null;
  onActivateProfile: (profile: ProfileInfo) => void;
  onSelectPane: (profile: ProfileInfo, paneId: string) => void;
  onClosePane: (profileId: string, paneId: string) => void;
  onAddTerminal: (profile: ProfileInfo) => void;
  addingTerminal?: boolean;
  onToggleBroadcast: (profileId: string, enabled: boolean) => void | Promise<void>;
  onUpdateDefaultCwd: (profileId: string, cwd: string) => void;
  onProfileDeleted: (profileId: string) => void;
}

export function ProfileSidebar({
  width = 240,
  activeProfileId,
  focusedPaneId,
  broadcastInput,
  availableTools,
  inventoryScanning = false,
  busy: profileBusy = false,
  getProfilePanes,
  getProfileFocusedPaneId,
  onActivateProfile,
  onSelectPane,
  onClosePane,
  onAddTerminal,
  addingTerminal = false,
  onToggleBroadcast,
  onUpdateDefaultCwd,
  onProfileDeleted,
}: Props) {
  const [tree, setTree] = useState<ProfileTree | null>(null);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsProfileId, setSettingsProfileId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const settingsProfile = useMemo(
    () => tree?.profiles.find((p) => p.id === settingsProfileId) ?? null,
    [tree, settingsProfileId],
  );

  const refresh = useCallback(async () => {
    setErr("");
    const r = await window.api.profileGetTree();
    if (!r.success || !r.tree) {
      setTree({ workspaceId: "", profiles: [], lastActiveProfileId: null });
      setErr(r.error ?? "Failed to load profiles");
      return;
    }
    setTree(r.tree);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, activeProfileId]);

  useEffect(() => {
    if (!activeProfileId) return;
    setExpandedIds((prev) => new Set(prev).add(activeProfileId));
  }, [activeProfileId]);

  const profileIds = useMemo(() => (tree?.profiles ?? []).map((p) => p.id), [tree]);

  const allProfilesExpanded =
    profileIds.length > 0 && profileIds.every((id) => expandedIds.has(id));

  function expandAllProfiles() {
    setExpandedIds(new Set(profileIds));
  }

  function collapseAllProfiles() {
    setExpandedIds(new Set());
  }

  function toggleExpanded(profileId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  const filtered = (tree?.profiles ?? []).filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q);
  });

  async function handleCreate(opts: {
    name: string;
    defaultCwd: string;
    defaultTool: string;
    accentColor: string | null;
  }) {
    setCreateOpen(false);
    setBusy(true);
    const r = await window.api.profileCreate(
      opts.name,
      opts.defaultCwd || undefined,
      opts.defaultTool,
      opts.accentColor,
    );
    setBusy(false);
    if (!r.success) setErr(r.error ?? "Failed to create profile");
    else {
      void refresh();
      if (r.profile) onActivateProfile(r.profile);
    }
  }

  async function handleSaveSettings(profileId: string, patch: ProfileSettingsPatch) {
    setBusy(true);
    const r = await window.api.profileUpdate(profileId, patch);
    setBusy(false);
    if (!r.success) {
      setErr(r.error ?? "Failed to save settings");
      return;
    }
    if (activeProfileId === profileId) {
      onUpdateDefaultCwd(profileId, patch.defaultCwd);
      if (broadcastInput !== patch.broadcastInput) {
        void onToggleBroadcast(profileId, patch.broadcastInput);
      }
    }
    setSettingsProfileId(null);
    void refresh();
  }

  async function handleDelete(profile: ProfileInfo) {
    const ok = confirm(
      `Delete profile "${profile.name}"?\n\nSaved terminals and layout will be removed.`,
    );
    if (!ok) return;
    setBusy(true);
    const r = await window.api.profileDelete(profile.id);
    setBusy(false);
    if (!r.success) setErr(r.error ?? "Failed to delete");
    else {
      if (settingsProfileId === profile.id) setSettingsProfileId(null);
      onProfileDeleted(profile.id);
      void refresh();
    }
  }

  function openSettings(e: React.MouseEvent, profile: ProfileInfo) {
    e.stopPropagation();
    setSettingsProfileId(profile.id);
  }

  function handleBroadcastToggle(profileId: string, enabled: boolean) {
    void (async () => {
      await onToggleBroadcast(profileId, enabled);
      void refresh();
    })();
  }

  return (
    <>
      <ProfileCreateDialog
        open={createOpen}
        availableTools={availableTools}
        inventoryScanning={inventoryScanning}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <ProfileSettingsDialog
        open={settingsProfileId !== null}
        profile={settingsProfile}
        availableTools={availableTools}
        inventoryScanning={inventoryScanning}
        busy={busy}
        onClose={() => setSettingsProfileId(null)}
        onSave={handleSaveSettings}
        onDelete={handleDelete}
      />

      <aside
        style={{ width }}
        className="flex shrink-0 flex-col border-r border-[#1f1f1f] bg-[#0a0a0a] text-[#e8e8e8]"
      >
        <div className="border-b border-[#1f1f1f] p-2.5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search profiles…"
            className="w-full rounded-md border border-[#252525] bg-[#111111] px-2.5 py-1.5 text-[12px] placeholder:text-[#5a5a5a] focus:border-[#404040] focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between px-2.5 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6b6b]">
            Profiles
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={allProfilesExpanded ? collapseAllProfiles : expandAllProfiles}
              disabled={profileIds.length === 0}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[12px] leading-none text-[#8a8a8a] hover:bg-[#1f1f1f] hover:text-[#e0e0e0] disabled:cursor-not-allowed disabled:opacity-40"
              title={allProfilesExpanded ? "收合全部" : "展開全部"}
              aria-label={allProfilesExpanded ? "收合全部" : "展開全部"}
            >
              {allProfilesExpanded ? "▴" : "▾"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCreateOpen(true)}
              className="cursor-pointer rounded px-1.5 text-[14px] text-[#8a8a8a] hover:text-[#e0e0e0]"
              title="New profile"
            >
              +
            </button>
          </div>
        </div>

        {err && <p className="px-2.5 pb-1 text-[11px] text-red-400">{err}</p>}

        <div className="flex-1 overflow-y-auto px-1.5 pb-2">
          {!tree && <p className="px-2 py-3 text-center text-[11px] text-[#5a5a5a]">Loading…</p>}
          {tree && filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-[#5a5a5a]">No profiles yet</p>
          )}
          {filtered.map((profile) => {
            const isActive = activeProfileId === profile.id;
            const defaultTool = profile.defaultTool || "shell";
            const expanded = expandedIds.has(profile.id);
            const profilePanes = getProfilePanes(profile.id);
            const profileFocusId = getProfileFocusedPaneId(profile.id);
            const sessionCount = profilePanes.length || profile.paneCount;
            const accentStyle = profileRowAccentStyle(profile.accentColor, isActive);
            const hasAccent = Boolean(profile.accentColor);

            return (
              <div key={profile.id} className="mb-1">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(profile.id)}
                    className="shrink-0 cursor-pointer rounded px-1 py-1 text-[10px] text-[#6b6b6b] hover:bg-[#1f1f1f] hover:text-[#c0c0c0]"
                    title={expanded ? "收合" : "展開"}
                    aria-expanded={expanded}
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onActivateProfile(profile)}
                    style={accentStyle}
                    className={`min-w-0 flex-1 cursor-pointer truncate rounded px-1.5 py-1 text-left text-[12px] transition-colors ${
                      isActive
                        ? hasAccent
                          ? "font-medium text-[#e8e8e8]"
                          : "bg-[#2a3a55] font-medium text-[#8ab4ff]"
                        : "text-[#b0b0b0] hover:bg-[#151515]"
                    }`}
                    title={profile.defaultCwd}
                  >
                    {hasAccent && (
                      <span
                        className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-sm align-middle"
                        style={{ backgroundColor: profile.accentColor! }}
                        aria-hidden
                      />
                    )}
                    {profile.name}
                    {sessionCount > 0 && (
                      <span className="ml-1 text-[10px] opacity-60">({sessionCount})</span>
                    )}
                  </button>
                  <label
                    className="flex shrink-0 cursor-pointer items-center rounded p-1 hover:bg-[#1f1f1f]"
                    title="同步輸入至所有 terminal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isActive ? broadcastInput : profile.broadcastInput}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleBroadcastToggle(profile.id, e.target.checked);
                      }}
                      disabled={profileBusy || busy}
                      className="h-3 w-3 accent-[#6b9fff]"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || profileBusy || addingTerminal}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddTerminal(profile);
                    }}
                    className="flex shrink-0 cursor-pointer items-center rounded p-1 hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:opacity-40"
                    title={`新增 terminal（${profileToolLabel(defaultTool)}）`}
                  >
                    <ToolLogo tool={defaultTool} size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => openSettings(e, profile)}
                    className="cursor-pointer rounded px-1 py-1 text-[12px] text-[#6b6b6b] hover:bg-[#1f1f1f] hover:text-[#c0c0c0]"
                    title="Profile 設定"
                  >
                    ⚙
                  </button>
                </div>

                {expanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[#252525] pl-2">
                    {(profilePanes.length > 0 ? profilePanes : profile.terminals).map((item, i) => {
                      const tool = item.tool;
                      const paneId = "id" in item ? item.id : `saved-${i}`;
                      const isLive = profilePanes.length > 0;
                      const selected = isActive && isLive && profileFocusId === paneId;

                      return (
                        <button
                          key={isLive ? paneId : `${tool}-${i}`}
                          type="button"
                          onClick={() => {
                            if (isLive) onSelectPane(profile, paneId);
                            else void onActivateProfile(profile);
                          }}
                          className={`flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors ${
                            selected
                              ? "border-l-2 border-[#6b9fff] pl-1 text-[#e8e8e8]"
                              : "border-l-2 border-transparent pl-1 text-[#808080] hover:text-[#c0c0c0]"
                          }`}
                        >
                          <ToolLogo tool={tool} size={12} />
                          <span className="min-w-0 flex-1 truncate">
                            {toolLabel(tool)} {i + 1}
                          </span>
                          {isActive && isLive && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                onClosePane(profile.id, paneId);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  onClosePane(profile.id, paneId);
                                }
                              }}
                              className="text-[10px] opacity-40 hover:opacity-100"
                            >
                              ✕
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {profilePanes.length === 0 && profile.terminals.length === 0 && (
                      <p className="py-1 text-[10px] text-[#505050]">尚無 session</p>
                    )}

                    <button
                      type="button"
                      disabled={busy || profileBusy || addingTerminal}
                      onClick={() => onAddTerminal(profile)}
                      className="flex w-full cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[#6b6b6b] hover:text-[#b0b0b0] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>+</span>
                      {addingTerminal && isActive ? "開啟中…" : "New Terminal"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-1 border-t border-[#1f1f1f] p-2">
          <button
            type="button"
            onClick={() => void window.api.openSettingsWindow()}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12px] text-[#8a8a8a] hover:bg-[#151515] hover:text-[#e0e0e0]"
          >
            <span>⚙</span> Settings
          </button>
        </div>
      </aside>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProfileInfo, ProfileTree } from "../types";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { paneDisplayLabel } from "../utils/pane-label";
import { toolLabel } from "../utils";
import { profileToolLabel } from "../utils/available-tools";
import type { PaneInfo } from "../terminal/split-tree";
import { formatPaneCwdShort } from "../utils/pane-cwd";
import { ProfileCreateDialog } from "./ProfileCreateDialog";
import {
  ProfileSettingsDialog,
  type ProfileSettingsPatch,
} from "./ProfileSettingsDialog";
import {
  profileAccentOrDefault,
  profileCardStyle,
  profileCardTopStripe,
  profileRowAccentStyle,
  profileSessionRowStyle,
  profileSessionsWellStyle,
} from "../utils/profile-colors";
import { hitPaneDropZone1D, type PaneDropZone } from "../terminal/pane-drop-zone";
import { useLocale } from "../i18n/LocaleProvider";
import { reorderById } from "../utils/reorder-by-id";
import {
  Chevron,
  DragHandle,
  ProfileCountBadge,
  SearchIcon,
  SidebarIconBtn,
} from "./ProfileSidebarUI";

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
  onRenamePane?: (profileId: string, paneId: string, title: string) => void;
  onMovePane?: (profileId: string, dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  onAddTerminal: (profile: ProfileInfo) => void;
  onOpenFolder?: (profile: ProfileInfo) => void;
  addingTerminal?: boolean;
  onToggleBroadcast: (profileId: string, enabled: boolean) => void | Promise<void>;
  onProfileUpdated: (profile: ProfileInfo) => void;
  onProfileDeleted: (profileId: string) => void;
  activeLivePaneCount?: number;
}

export function ProfileSidebar({
  width = 268,
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
  onRenamePane,
  onMovePane,
  onAddTerminal,
  onOpenFolder,
  addingTerminal = false,
  onToggleBroadcast,
  onProfileUpdated,
  onProfileDeleted,
  activeLivePaneCount = 0,
}: Props) {
  const { t } = useLocale();
  const [tree, setTree] = useState<ProfileTree | null>(null);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsProfileId, setSettingsProfileId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);
  const [paneDropZone, setPaneDropZone] = useState<"above" | "below" | null>(null);

  const settingsProfile = useMemo(
    () => tree?.profiles.find((p) => p.id === settingsProfileId) ?? null,
    [tree, settingsProfileId],
  );

  const refresh = useCallback(async () => {
    setErr("");
    const r = await window.api.profileGetTree();
    if (!r.success || !r.tree) {
      setTree({ workspaceId: "", profiles: [], lastActiveProfileId: null });
      setErr(r.error ?? t("profile.failedLoad"));
      return;
    }
    setTree(r.tree);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, activeProfileId, activeLivePaneCount]);

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

  const canReorder = !query.trim();

  const filtered = (tree?.profiles ?? []).filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q);
  });

  function reorderLocalProfiles(orderedIds: string[]) {
    setTree((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.profiles.map((p) => [p.id, p]));
      const profiles = orderedIds.map((id) => byId.get(id)).filter(Boolean) as ProfileInfo[];
      return { ...prev, profiles };
    });
  }

  function handlePaneMove(
    profileId: string,
    dragId: string,
    targetId: string,
    zone: PaneDropZone,
  ) {
    if (!onMovePane || dragId === targetId) return;
    onMovePane(profileId, dragId, targetId, zone);
  }

  function clearPaneDrag() {
    setDraggingPaneId(null);
    setDragOverPaneId(null);
    setPaneDropZone(null);
  }

  async function handleReorder(dragId: string, dropId: string) {
    if (!tree) return;
    const reordered = reorderById(tree.profiles, dragId, dropId, (p) => p.id);
    if (!reordered) return;

    const nextIds = reordered.map((p) => p.id);
    const prevTree = tree;
    reorderLocalProfiles(nextIds);
    setBusy(true);
    const r = await window.api.profileReorder(nextIds);
    setBusy(false);
    if (!r.success) {
      setTree(prevTree);
      setErr(r.error ?? t("profile.failedReorder"));
      return;
    }
    if (r.tree) setTree(r.tree);
  }

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
    if (!r.success) setErr(r.error ?? t("profile.failedCreate"));
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
      setErr(r.error ?? t("profile.failedSave"));
      return;
    }
    if (r.profile) {
      onProfileUpdated(r.profile);
      setTree((prev) =>
        prev
          ? {
              ...prev,
              profiles: prev.profiles.map((p) => (p.id === profileId ? r.profile! : p)),
            }
          : prev,
      );
    }
    if (activeProfileId === profileId && broadcastInput !== patch.broadcastInput) {
      void onToggleBroadcast(profileId, patch.broadcastInput);
    }
    setSettingsProfileId(null);
    void refresh();
  }

  async function handleDelete(profile: ProfileInfo) {
    const ok = confirm(
      t("profile.deleteConfirm", { name: profile.name }),
    );
    if (!ok) return;
    setBusy(true);
    const r = await window.api.profileDelete(profile.id);
    setBusy(false);
    if (!r.success) setErr(r.error ?? t("profile.failedDelete"));
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
        className="flex shrink-0 flex-col border-r border-[#1a1a1e] bg-gradient-to-b from-[#0c0c0e] to-[#09090b] text-[#e8e8ec]"
      >
        <div className="border-b border-[#1a1a1e]/80 px-2.5 py-2.5">
          <div className="relative">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("profile.search")}
              className="h-8 w-full rounded-lg border border-[#252528] bg-[#111114] pl-8 pr-2.5 text-[12px] text-[#e8e8ec] placeholder:text-[#5c5c64] transition-colors focus:border-[#3a3a42] focus:bg-[#131316] focus:outline-none focus:ring-1 focus:ring-white/[0.06]"
            />
          </div>
        </div>

        <div className="flex h-9 shrink-0 items-center justify-between px-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5c5c64]">
            {t("profile.title")}
          </span>
          <div className="flex items-center gap-0.5">
            <SidebarIconBtn
              title={allProfilesExpanded ? t("profile.collapseAll") : t("profile.expandAll")}
              disabled={profileIds.length === 0}
              onClick={() =>
                allProfilesExpanded ? collapseAllProfiles() : expandAllProfiles()
              }
            >
              <span className={allProfilesExpanded ? "inline-flex rotate-180" : "inline-flex"}>
                <Chevron expanded />
              </span>
            </SidebarIconBtn>
            <SidebarIconBtn
              title={t("profile.new")}
              disabled={busy}
              onClick={() => setCreateOpen(true)}
              className="text-[15px] font-light"
            >
              +
            </SidebarIconBtn>
          </div>
        </div>

        {err && <p className="px-2.5 pb-1 text-[11px] text-red-400">{err}</p>}

        <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2.5">
          {!tree && (
            <p className="px-2 py-6 text-center text-[11px] text-[#5c5c64]">{t("profile.loading")}</p>
          )}
          {tree && filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-[11px] text-[#5c5c64]">
              {query.trim() ? t("profile.noMatch") : t("profile.empty")}
            </p>
          )}
          {filtered.map((profile) => {
            const isActive = activeProfileId === profile.id;
            const defaultTool = profile.defaultTool || "shell";
            const expanded = expandedIds.has(profile.id);
            const profilePanes = getProfilePanes(profile.id);
            const profileFocusId = getProfileFocusedPaneId(profile.id);
            const listedSessions =
              profilePanes.length > 0
                ? profilePanes
                : isActive
                  ? []
                  : profile.terminals;
            const sessionCount = listedSessions.length;
            const canReorderPanes =
              canReorder && isActive && profilePanes.length > 1 && Boolean(onMovePane);
            const accent = profile.accentColor;
            const hasAccent = Boolean(accent);
            const accentDefault = profileAccentOrDefault(accent);
            const cardStyle = profileCardStyle(accent, isActive);
            const rowStyle = profileRowAccentStyle(accent, isActive);
            const topStripe = profileCardTopStripe(accent);

            return (
              <div
                key={profile.id}
                className={`overflow-hidden rounded-xl border transition-all duration-150 ${
                  dragOverId === profile.id && draggingId !== profile.id
                    ? "ring-2 ring-[#7eb6ff]/35"
                    : draggingId === profile.id
                      ? "opacity-45 scale-[0.99]"
                      : ""
                } ${isActive && !hasAccent ? "border-[#2d3f5c]" : "border-transparent"}`}
                style={cardStyle}
                onDragOver={(e) => {
                  if (!canReorder || !draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverId(profile.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === profile.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  if (!canReorder || !draggingId) return;
                  e.preventDefault();
                  void handleReorder(draggingId, profile.id);
                  setDraggingId(null);
                  setDragOverId(null);
                }}
              >
                {topStripe && <div className="w-full shrink-0" style={topStripe} />}

                <div className="flex min-h-[36px] items-center gap-0.5 px-1 py-1">
                  {canReorder && (
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(profile.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                      className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded hover:bg-white/[0.04] active:cursor-grabbing"
                      title={t("sidebar.dragReorder")}
                      aria-label={t("sidebar.dragReorder")}
                    >
                      <DragHandle />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(profile.id)}
                    className="flex h-7 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-white/[0.05]"
                    title={expanded ? t("profile.collapse") : t("profile.expand")}
                    aria-expanded={expanded}
                  >
                    <Chevron expanded={expanded} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onActivateProfile(profile)}
                    style={rowStyle}
                    className={`flex min-h-[32px] min-w-0 flex-1 cursor-pointer items-center truncate rounded-lg px-2 text-left text-[12px] font-medium transition-colors ${
                      isActive && !hasAccent
                        ? "text-[#8ab4ff]"
                        : hasAccent
                          ? "text-[#ececef]"
                          : "text-[#b4b4ba] hover:bg-white/[0.04]"
                    }`}
                    title={profile.defaultCwd}
                  >
                    {hasAccent && (
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] shadow-sm"
                        style={{
                          backgroundColor: accent!,
                          boxShadow: `0 0 8px ${accent}66`,
                        }}
                        aria-hidden
                      />
                    )}
                    <span className="truncate">{profile.name}</span>
                    {sessionCount > 0 && (
                      <ProfileCountBadge count={sessionCount} accent={accent} />
                    )}
                  </button>
                  <label
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-white/[0.05]"
                    title={t("profile.syncBroadcast")}
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
                      className="h-3.5 w-3.5 rounded accent-[#7eb6ff]"
                    />
                  </label>
                  {onOpenFolder && (
                    <SidebarIconBtn
                      title={t("profile.pickFolderNewPane")}
                      disabled={busy || profileBusy || addingTerminal}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFolder(profile);
                      }}
                    >
                      📁
                    </SidebarIconBtn>
                  )}
                  <SidebarIconBtn
                    title={t("profile.addTerminal", { tool: profileToolLabel(defaultTool) })}
                    disabled={busy || profileBusy || addingTerminal}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddTerminal(profile);
                    }}
                  >
                    <ToolLogo tool={defaultTool} size={15} />
                  </SidebarIconBtn>
                  <SidebarIconBtn
                    title={t("profile.settings")}
                    onClick={(e) => openSettings(e, profile)}
                    className="text-[13px]"
                  >
                    ⚙
                  </SidebarIconBtn>
                </div>

                {expanded && (
                  <div
                    className="mx-2 mb-2 space-y-0.5 rounded-lg border-l-2 py-1 pl-2 pr-1"
                    style={profileSessionsWellStyle(accent)}
                  >
                    {listedSessions.map((item, i) => {
                      const tool = item.tool;
                      const paneId = "id" in item ? item.id : `saved-${i}`;
                      const paneCwd = "cwd" in item ? item.cwd : "";
                      const cwdShort = formatPaneCwdShort(paneCwd);
                      const isLive = profilePanes.length > 0;
                      const isPaneInfo = "id" in item;
                      const selected = isActive && isLive && profileFocusId === paneId;
                      const showLiveDot = isLive && isActive;
                      const sessionLabel = isPaneInfo
                        ? paneDisplayLabel(item)
                        : item.title?.trim() || `${toolLabel(tool)} ${i + 1}`;
                      const canRename = Boolean(isActive && isLive && isPaneInfo && onRenamePane);

                      return (
                        <div
                          key={isLive ? paneId : `${tool}-${i}`}
                          className={`relative flex min-h-[32px] items-center gap-0.5 rounded-lg transition-all duration-150 ${
                            dragOverPaneId === paneId && draggingPaneId !== paneId
                              ? "ring-2 ring-[#7eb6ff]/35"
                              : draggingPaneId === paneId
                                ? "opacity-45 scale-[0.99]"
                                : ""
                          }`}
                          onDragOver={(e) => {
                            if (!canReorderPanes || !draggingPaneId || !isPaneInfo) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPaneDropZone(hitPaneDropZone1D(e.clientY, rect));
                            setDragOverPaneId(paneId);
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                              if (dragOverPaneId === paneId) {
                                setDragOverPaneId(null);
                                setPaneDropZone(null);
                              }
                            }
                          }}
                          onDrop={(e) => {
                            if (!canReorderPanes || !draggingPaneId || !isPaneInfo) return;
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const zone = hitPaneDropZone1D(e.clientY, rect);
                            handlePaneMove(profile.id, draggingPaneId, paneId, zone);
                            clearPaneDrag();
                          }}
                        >
                          {dragOverPaneId === paneId &&
                            draggingPaneId !== paneId &&
                            paneDropZone && (
                              <span
                                className={`pointer-events-none absolute left-1 right-1 h-0.5 rounded-full bg-[#7eb6ff] ${
                                  paneDropZone === "above" ? "top-0" : "bottom-0"
                                }`}
                                aria-hidden
                              />
                            )}
                          {canReorderPanes && isPaneInfo && (
                            <span
                              draggable
                              onDragStart={(e) => {
                                setDraggingPaneId(paneId);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={clearPaneDrag}
                              className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded hover:bg-white/[0.04] active:cursor-grabbing"
                              title={t("profile.dragReorder")}
                              aria-label={t("profile.dragReorder")}
                            >
                              <DragHandle />
                            </span>
                          )}
                        <button
                          type="button"
                          onClick={() => {
                            if (isLive) onSelectPane(profile, paneId);
                            else void onActivateProfile(profile);
                          }}
                          style={profileSessionRowStyle(accent, selected)}
                          className={`group/session flex min-h-[32px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left text-[11px] transition-colors ${
                            selected
                              ? "font-medium text-[#f4f4f6]"
                              : "text-[#8b8b92] hover:bg-white/[0.04] hover:text-[#d4d4d8]"
                          } ${!isLive ? "opacity-65" : ""}`}
                        >
                          {showLiveDot ? (
                            <span
                              className="profile-live-dot h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: accentDefault }}
                              aria-hidden
                            />
                          ) : hasAccent ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full opacity-40" style={{ backgroundColor: accent! }} aria-hidden />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0" aria-hidden />
                          )}
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03]"
                            style={
                              selected && accent
                                ? {
                                    backgroundColor: `${accent}18`,
                                    borderColor: `${accent}33`,
                                  }
                                : undefined
                            }
                          >
                            <ToolLogo tool={tool} size={14} />
                          </span>
                          <div
                            className="flex min-w-0 flex-1 items-center gap-1 truncate"
                            title={paneCwd ? `${sessionLabel}\n${paneCwd}` : sessionLabel}
                          >
                            {canRename ? (
                              <EditablePaneTitle
                                label={sessionLabel}
                                onRename={(title) => onRenamePane!(profile.id, paneId, title)}
                                className="min-w-0 truncate text-[11px]"
                                inputClassName="text-[11px]"
                              />
                            ) : (
                              <span className="min-w-0 truncate">{sessionLabel}</span>
                            )}
                            {cwdShort ? (
                              <span className="shrink-0 text-[10px] text-[#5c5c64]">· {cwdShort}</span>
                            ) : null}
                          </div>
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
                              className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] text-[#6b6b72] opacity-0 transition-opacity hover:bg-white/10 hover:text-[#f0f0f2] group-hover/session:opacity-100"
                            >
                              ✕
                            </span>
                          )}
                        </button>
                        </div>
                      );
                    })}

                    {listedSessions.length === 0 && (
                      <p className="px-2 py-2.5 text-[10px] text-[#5c5c64]">{t("profile.noSessions")}</p>
                    )}

                    <button
                      type="button"
                      disabled={busy || profileBusy || addingTerminal}
                      onClick={() => onAddTerminal(profile)}
                      className="mt-0.5 flex min-h-[30px] w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-[11px] text-[#6b6b72] transition-colors hover:bg-white/[0.04] hover:text-[#b4b4ba] disabled:cursor-not-allowed disabled:opacity-40"
                      style={hasAccent && accent ? { color: accent } : undefined}
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-white/[0.1] text-[12px]"
                        style={
                          hasAccent && accent
                            ? {
                                borderColor: `${accent}44`,
                                backgroundColor: `${accent}12`,
                                color: accent,
                              }
                            : undefined
                        }
                      >
                        +
                      </span>
                      {addingTerminal && isActive ? t("profile.opening") : t("profile.newTerminal")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-[#1a1a1e] p-2">
          <button
            type="button"
            onClick={() => void window.api.openSettingsWindow()}
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[12px] text-[#8b8b92] transition-colors hover:bg-white/[0.04] hover:text-[#e8e8ec]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.04] text-[11px]">
              ⚙
            </span>
            {t("sidebar.settings")}
          </button>
        </div>
      </aside>
    </>
  );
}

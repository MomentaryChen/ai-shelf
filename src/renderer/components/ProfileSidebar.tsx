import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppThemeRevision } from "../app-theme";
import type { ProfileForest, ProfileGroupNode, ProfileInfo } from "../types";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { paneDisplayLabel } from "../utils/pane-label";
import { toolLabel } from "../utils";
import { profileToolLabel } from "../utils/available-tools";
import type { PaneInfo } from "../terminal/split-tree";
import { formatPaneCwdShort } from "../utils/pane-cwd";
import { ProfileCreateDialog } from "./ProfileCreateDialog";
import { ProfileGroupNameDialog } from "./ProfileGroupNameDialog";
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
import { writeProfilePaneDrag } from "../terminal/profile-pane-display";
import { useLocale } from "../i18n/LocaleProvider";
import { reorderById } from "../utils/reorder-by-id";
import {
  Chevron,
  DragHandle,
  ProfileCountBadge,
  SearchIcon,
  SidebarIconBtn,
  SidebarPanelChevron,
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
  onRestorePane?: (profile: ProfileInfo, paneId: string) => void;
  onPlacePaneBeside?: (
    profile: ProfileInfo,
    dragPaneId: string,
    targetPaneId: string,
    zone: "above" | "below" | "left" | "right",
  ) => void;
  onMinimizePane?: (profileId: string, paneId: string) => void;
  isPaneMinimized?: (profileId: string, paneId: string) => boolean;
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
  onProfilePaneDragChange?: (active: boolean) => void;
  onCollapse?: () => void;
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
  onRestorePane,
  onPlacePaneBeside,
  onMinimizePane,
  isPaneMinimized,
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
  onProfilePaneDragChange,
  onCollapse,
}: Props) {
  const { t } = useLocale();
  const [forest, setForest] = useState<ProfileForest | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [settingsProfileId, setSettingsProfileId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  useAppThemeRevision();
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);
  const [paneDropZone, setPaneDropZone] = useState<"above" | "below" | null>(null);

  const allProfiles = useMemo(
    () => forest?.groups.flatMap((g) => g.profiles) ?? [],
    [forest],
  );
  const settingsProfile = useMemo(
    () => allProfiles.find((p) => p.id === settingsProfileId) ?? null,
    [allProfiles, settingsProfileId],
  );
  const activeGroup = useMemo(
    () =>
      forest?.groups.find((g) => g.id === activeGroupId) ??
      forest?.groups.find((g) => g.id === forest.lastActiveGroupId) ??
      forest?.groups[0] ??
      null,
    [forest, activeGroupId],
  );

  const refresh = useCallback(async () => {
    setErr("");
    const r = await window.api.profileGroupGetForest();
    if (!r.success || !r.forest) {
      setForest({ groups: [], lastActiveGroupId: null, lastActiveProfileId: null });
      setErr(r.error ?? t("profile.failedLoad"));
      return;
    }
    setForest(r.forest);
    if (r.forest.groups.length === 0) {
      setActiveGroupId(null);
      return;
    }
    const known = activeGroupId
      ? r.forest.groups.some((g) => g.id === activeGroupId)
      : false;
    if (!known) {
      setActiveGroupId(r.forest.lastActiveGroupId ?? r.forest.groups[0].id);
    }
  }, [activeGroupId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh, activeProfileId, activeLivePaneCount]);

  useEffect(() => {
    if (!activeProfileId) return;
    setExpandedIds((prev) => new Set(prev).add(activeProfileId));
  }, [activeProfileId]);

  const profileIds = useMemo(() => allProfiles.map((p) => p.id), [allProfiles]);

  const allProfilesExpanded =
    profileIds.length > 0 && profileIds.every((id) => expandedIds.has(id));

  function expandAllProfiles() {
    setExpandedIds(new Set(profileIds));
  }

  function collapseAllProfiles() {
    setExpandedIds(new Set());
  }

  function toggleGroupExpanded(groupId: string) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
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
  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      (forest?.groups ?? []).map((group) => ({
        group,
        profiles: group.profiles.filter((p) =>
          q ? p.name.toLowerCase().includes(q) : true,
        ),
      })),
    [forest, q],
  );
  const visibleGroups = filteredGroups.filter((entry) => entry.profiles.length > 0);

  useEffect(() => {
    const groupIds = (forest?.groups ?? []).map((g) => g.id);
    if (groupIds.length === 0) {
      setExpandedGroupIds(new Set());
      return;
    }
    setExpandedGroupIds((prev) => {
      const next = new Set<string>();
      groupIds.forEach((id) => {
        if (prev.has(id)) next.add(id);
      });
      if (next.size === 0) groupIds.forEach((id) => next.add(id));
      return next;
    });
  }, [forest]);

  function reorderLocalProfiles(groupId: string, orderedIds: string[]) {
    setForest((prev) => {
      if (!prev) return prev;
      const group = prev.groups.find((g) => g.id === groupId);
      if (!group) return prev;
      const byId = new Map(group.profiles.map((p) => [p.id, p]));
      const profiles = orderedIds.map((id) => byId.get(id)).filter(Boolean) as ProfileInfo[];
      return {
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? { ...g, profiles } : g)),
      };
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

  function beginProfilePaneDrag(
    e: React.DragEvent,
    profileId: string,
    paneId: string,
  ) {
    writeProfilePaneDrag(e.dataTransfer, { profileId, paneId });
    onProfilePaneDragChange?.(true);
  }

  function endProfilePaneDrag() {
    onProfilePaneDragChange?.(false);
  }

  async function handleReorder(group: ProfileGroupNode, dragId: string, dropId: string) {
    const reordered = reorderById(group.profiles, dragId, dropId, (p) => p.id);
    if (!reordered) return;

    const nextIds = reordered.map((p) => p.id);
    const prevForest = forest;
    reorderLocalProfiles(group.id, nextIds);
    setBusy(true);
    const r = await window.api.profileReorder(group.id, nextIds);
    setBusy(false);
    if (!r.success) {
      setForest(prevForest ?? null);
      setErr(r.error ?? t("profile.failedReorder"));
      return;
    }
    if (r.forest) setForest(r.forest);
  }

  async function handleCreate(opts: {
    groupId: string;
    name: string;
    defaultCwd: string;
    defaultTool: string;
    accentColor: string | null;
    broadcastInput: boolean;
    copyFromProfileId?: string;
  }) {
    setCreateOpen(false);
    setBusy(true);
    setErr("");
    setActiveGroupId(opts.groupId);
    const r = await window.api.profileCreate(opts.name, {
      groupId: opts.groupId,
      defaultCwd: opts.defaultCwd || undefined,
      defaultTool: opts.defaultTool,
      accentColor: opts.accentColor,
      broadcastInput: opts.broadcastInput,
      copyFromProfileId: opts.copyFromProfileId,
    });
    setBusy(false);
    if (!r.success) setErr(r.error ?? t("profile.failedCreate"));
    else {
      if (r.profile) {
        setForest((prev) =>
          prev
            ? {
                ...prev,
                groups: prev.groups.map((g) =>
                  g.id === r.profile!.workspaceId
                    ? {
                        ...g,
                        profileCount: g.profileCount + 1,
                        profiles: [...g.profiles, r.profile!],
                      }
                    : g,
                ),
                lastActiveGroupId: r.profile.workspaceId,
                lastActiveProfileId: r.profile.id,
              }
            : prev,
        );
      }
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
      setForest((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.map((g) => ({
                ...g,
                profiles: g.profiles.map((p) => (p.id === profileId ? r.profile! : p)),
              })),
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
        profiles={allProfiles}
        profileGroups={(forest?.groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
        defaultGroupId={activeGroup?.id ?? forest?.groups[0]?.id ?? ""}
        availableTools={availableTools}
        inventoryScanning={inventoryScanning}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        onQuickCreateGroup={async (name) => {
          setBusy(true);
          const r = await window.api.profileGroupCreate(name);
          setBusy(false);
          if (!r.success || !r.group) {
            return { ok: false, error: r.error ?? t("profileGroup.failedCreate") };
          }
          setForest((prev) =>
            prev
              ? {
                  ...prev,
                  groups: [...prev.groups.filter((g) => g.id !== r.group!.id), { ...r.group!, profiles: [] }],
                }
              : {
                  groups: [{ ...r.group, profiles: [] }],
                  lastActiveGroupId: r.group.id,
                  lastActiveProfileId: null,
                },
          );
          setActiveGroupId(r.group.id);
          setErr("");
          return { ok: true, groupId: r.group.id };
        }}
      />
      <ProfileGroupNameDialog
        open={createGroupOpen}
        title={t("profileGroup.createTitle")}
        submitLabel={t("profileGroup.create")}
        busy={busy}
        onClose={() => setCreateGroupOpen(false)}
        onSubmit={async (name) => {
          setBusy(true);
          const r = await window.api.profileGroupCreate(name);
          setBusy(false);
          if (!r.success) setErr(r.error ?? t("profileGroup.failedCreate"));
          else if (r.group) {
            setForest((prev) =>
              prev
                ? {
                    ...prev,
                    groups: [...prev.groups.filter((g) => g.id !== r.group!.id), { ...r.group!, profiles: [] }],
                  }
                : {
                    groups: [{ ...r.group, profiles: [] }],
                    lastActiveGroupId: r.group.id,
                    lastActiveProfileId: null,
                  },
            );
            setActiveGroupId(r.group.id);
            setQuery("");
            setErr("");
          }
          setCreateGroupOpen(false);
          void refresh();
        }}
      />
      <ProfileGroupNameDialog
        open={renameGroupOpen}
        title={t("profileGroup.renameTitle")}
        initialName={activeGroup?.name ?? ""}
        submitLabel={t("profileGroup.rename")}
        busy={busy}
        onClose={() => setRenameGroupOpen(false)}
        onSubmit={async (name) => {
          if (!activeGroup) return;
          setBusy(true);
          const r = await window.api.profileGroupUpdate(activeGroup.id, name);
          setBusy(false);
          if (!r.success) setErr(r.error ?? t("profileGroup.failedRename"));
          else if (r.group) {
            setForest((prev) =>
              prev
                ? {
                    ...prev,
                    groups: prev.groups.map((g) =>
                      g.id === r.group!.id ? { ...g, name: r.group!.name } : g,
                    ),
                  }
                : prev,
            );
          }
          setRenameGroupOpen(false);
          void refresh();
        }}
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
        className="flex shrink-0 flex-col border-r border-chrome-border bg-gradient-to-b from-chrome-bg-top to-chrome-bg-bottom text-chrome-text"
      >
        <div className="border-b border-chrome-border/80 px-2.5 py-2.5">
          <div className="relative">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("profile.search")}
              className="h-8 w-full rounded-lg border border-chrome-border-input bg-chrome-surface pl-8 pr-2.5 text-[12px] text-chrome-text placeholder:text-chrome-text-dim transition-colors focus:border-chrome-border-focus focus:bg-[#131316] focus:outline-none focus:ring-1 focus:ring-white/[0.06]"

            />
          </div>
        </div>

        <div className="flex h-9 shrink-0 items-center justify-between px-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-chrome-text-dim">
            {t("profile.hierarchyTitle")}
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
              disabled={busy || (forest?.groups.length ?? 0) === 0}
              onClick={() => setCreateOpen(true)}
              className="px-2 text-[11px] font-medium"
            >
              + {t("profile.newShort")}
            </SidebarIconBtn>
            <SidebarIconBtn
              title={t("profileGroup.new")}
              disabled={busy}
              onClick={() => setCreateGroupOpen(true)}
              className="px-2 text-[11px] font-medium"
            >
              + {t("profileGroup.newShort")}
            </SidebarIconBtn>
            {onCollapse && (
              <SidebarIconBtn title={t("sidebar.collapse")} onClick={onCollapse}>
                <SidebarPanelChevron expanded />
              </SidebarIconBtn>
            )}
          </div>
        </div>

        {err && <p className="px-2.5 pb-1 text-[11px] text-red-400">{err}</p>}
        <div className="px-2.5 pb-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-chrome-text-dim">
            1. {t("profileGroup.title")}
          </div>
          <div className="space-y-1">
            {(forest?.groups ?? []).map((g) => {
              const selected = g.id === activeGroup?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroupId(g.id)}
                  className={`flex h-8 w-full cursor-pointer items-center justify-between rounded-lg border px-2 text-left text-[12px] transition-colors ${
                    selected
                      ? "border-chrome-border-focus bg-chrome-surface text-chrome-text"
                      : "border-chrome-border-input bg-transparent text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text-secondary"
                  }`}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="shrink-0 text-[10px] text-chrome-text-dim">{g.profiles.length}</span>
                </button>
              );
            })}
          </div>
          {activeGroup && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="text-[10px] text-chrome-text-dim">
                {t("profileGroup.summary", { count: activeGroup.profiles.length })}
              </div>
              <div className="flex gap-1">
                <SidebarIconBtn
                  title={t("profileGroup.rename")}
                  disabled={busy}
                  onClick={() => setRenameGroupOpen(true)}
                >
                  ✎
                </SidebarIconBtn>
                <SidebarIconBtn
                  title={t("profileGroup.delete")}
                  disabled={busy || (forest?.groups.length ?? 0) <= 1}
                  onClick={async () => {
                    const ok = confirm(t("profileGroup.deleteConfirm", { name: activeGroup.name }));
                    if (!ok) return;
                    setBusy(true);
                    const r = await window.api.profileGroupDelete(activeGroup.id);
                    setBusy(false);
                    if (!r.success) setErr(r.error ?? t("profileGroup.failedDelete"));
                    else {
                      setActiveGroupId(null);
                      void refresh();
                    }
                  }}
                >
                  ✕
                </SidebarIconBtn>
              </div>
            </div>
          )}
          {!activeGroup && (
            <div className="mt-1.5 text-[10px] text-chrome-text-dim">{t("profileGroup.emptyHint")}</div>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2.5">
          <div className="px-2 text-[10px] uppercase tracking-[0.12em] text-chrome-text-dim">
            2. {t("profile.title")}
          </div>
          {activeGroup && (
            <div className="px-2 text-[10px] text-chrome-text-dim">
              {t("profile.hierarchyPath", { group: activeGroup.name })}
            </div>
          )}
          {!forest && (
            <p className="px-2 py-6 text-center text-[11px] text-chrome-text-dim">{t("profile.loading")}</p>
          )}
          {forest && visibleGroups.length === 0 && (
            <p className="px-2 py-6 text-center text-[11px] text-chrome-text-dim">
              {query.trim() ? t("profile.noMatch") : t("profile.empty")}

            </p>
          )}
          {visibleGroups.map(({ group, profiles }) => {
            const groupExpanded = expandedGroupIds.has(group.id);
            return (
              <div key={group.id} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroupExpanded(group.id)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-chrome-text-secondary hover:bg-chrome-hover"
                >
                  <span className="truncate">{group.name}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-chrome-text-dim">
                    {profiles.length}
                    <Chevron expanded={groupExpanded} />
                  </span>
                </button>
                {groupExpanded &&
                  profiles.map((profile) => {
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
            const canReorderProfiles = canReorder && group.id === activeGroup?.id;
            const accent = profile.accentColor;
            const hasAccent = Boolean(accent);
            const accentDefault = profileAccentOrDefault(accent);
            const cardStyle = profileCardStyle(accent, isActive);
            const rowStyle = profileRowAccentStyle(accent, isActive);
            const topStripe = profileCardTopStripe(accent);

            return (
              <div
                key={profile.id}
                className={`overflow-hidden rounded-xl border-2 transition-all duration-150 ${
                  canReorderProfiles && dragOverId === profile.id && draggingId !== profile.id
                    ? "ring-2 ring-accent/35"
                    : canReorderProfiles && draggingId === profile.id
                      ? "opacity-45 scale-[0.99]"
                      : ""
                } ${isActive && !hasAccent ? "border-chrome-profile-card-active-border" : "border-solid"}`}
                style={cardStyle}
                onDragOver={(e) => {
                  if (!canReorderProfiles || !draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverId(profile.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === profile.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  if (!canReorderProfiles || !draggingId) return;
                  e.preventDefault();
                  void handleReorder(group, draggingId, profile.id);
                  setDraggingId(null);
                  setDragOverId(null);
                }}
              >
                {topStripe && <div className="w-full shrink-0" style={topStripe} />}

                <div className="flex min-h-[36px] items-center gap-0.5 px-1 py-1">
                  {canReorderProfiles && (
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
                      className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded hover:bg-chrome-hover active:cursor-grabbing"
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
                        ? "text-chrome-accent-text"
                        : hasAccent
                          ? "text-chrome-text"
                          : "text-chrome-text-secondary hover:bg-chrome-hover"
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
                      className="h-3.5 w-3.5 rounded accent-accent"
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
                    className="mx-2 mb-2 space-y-0.5 rounded-lg border-l-[3px] border-solid py-1 pl-2 pr-1"
                    style={profileSessionsWellStyle(accent)}
                  >
                    <div className="px-2 pt-0.5 text-[10px] uppercase tracking-[0.1em] text-chrome-text-dim">
                      3. {t("terminal.title")}
                    </div>
                    {listedSessions.map((item, i) => {
                      const tool = item.tool;
                      const paneId = "id" in item ? item.id : `saved-${i}`;
                      const paneCwd = "cwd" in item ? item.cwd : "";
                      const cwdShort = formatPaneCwdShort(paneCwd);
                      const isLive = profilePanes.length > 0;
                      const isPaneInfo = "id" in item;
                      const minimized =
                        isLive && isPaneMinimized?.(profile.id, paneId) === true;
                      const selected = isActive && isLive && profileFocusId === paneId && !minimized;
                      const showLiveDot = isLive && isActive && !minimized;
                      const sessionLabel = isPaneInfo
                        ? paneDisplayLabel(item)
                        : item.title?.trim() || `${toolLabel(tool)} ${i + 1}`;
                      const canRename = Boolean(isActive && isLive && isPaneInfo && onRenamePane);
                      const sessionRowTitle = isLive
                        ? minimized
                          ? t("profile.showInDisplay")
                          : isActive && profileFocusId && profileFocusId !== paneId
                            ? t("profile.dragOrShiftAlongside")
                            : t("profile.dragToDisplay")
                        : undefined;

                      return (
                        <div
                          key={isLive ? paneId : `${tool}-${i}`}
                          className={`relative flex min-h-[32px] items-center gap-0.5 rounded-lg transition-all duration-150 ${
                            dragOverPaneId === paneId && draggingPaneId !== paneId
                              ? "ring-2 ring-accent/35"
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
                                className={`pointer-events-none absolute left-1 right-1 h-0.5 rounded-full bg-accent ${
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
                                beginProfilePaneDrag(e, profile.id, paneId);
                              }}
                              onDragEnd={() => {
                                clearPaneDrag();
                                endProfilePaneDrag();
                              }}
                              className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded hover:bg-chrome-hover active:cursor-grabbing"
                              title={t("profile.dragReorder")}
                              aria-label={t("profile.dragReorder")}

                            >
                              <DragHandle />
                            </span>
                          )}
                        <div
                          draggable={isLive && isPaneInfo}
                          onDragStart={(e) => {
                            if (!isLive || !isPaneInfo) return;
                            beginProfilePaneDrag(e, profile.id, paneId);
                          }}
                          onDragEnd={endProfilePaneDrag}
                          className={`group/session flex min-h-[32px] min-w-0 flex-1 ${
                            isLive && isPaneInfo ? "cursor-grab active:cursor-grabbing" : ""
                          }`}
                        >
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            if (e.button !== 1 || !isActive || !isLive || !isPaneInfo) return;
                            e.preventDefault();
                            e.stopPropagation();
                            onClosePane(profile.id, paneId);
                          }}
                          onClick={(e) => {
                            if (!isLive) {
                              void onActivateProfile(profile);
                              return;
                            }
                            if (
                              e.shiftKey &&
                              isActive &&
                              profileFocusId &&
                              profileFocusId !== paneId &&
                              onPlacePaneBeside
                            ) {
                              onPlacePaneBeside(profile, paneId, profileFocusId, "right");
                              return;
                            }
                            onSelectPane(profile, paneId);
                          }}
                          style={profileSessionRowStyle(accent, selected)}
                          className={`flex min-h-[32px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-left text-[11px] transition-colors ${
                            selected
                              ? "font-medium text-chrome-text"
                              : minimized
                                ? "text-chrome-text-dim hover:bg-chrome-hover hover:text-chrome-text-secondary"
                                : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text-secondary"
                          } ${!isLive ? "opacity-65" : minimized ? "opacity-70" : ""}`}
                          title={
                            sessionRowTitle && isActive && isPaneInfo
                              ? `${sessionRowTitle} · ${t("profile.middleClickClose")}`
                              : sessionRowTitle
                          }
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
                              <span className="shrink-0 text-[10px] text-chrome-text-dim">· {cwdShort}</span>
                            ) : null}
                          </div>
                          {isActive && isLive && (
                            <>
                              {minimized && onRestorePane && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRestorePane(profile, paneId);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.stopPropagation();
                                      onRestorePane(profile, paneId);
                                    }
                                  }}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] text-chrome-accent-text opacity-100 hover:bg-chrome-hover-strong"
                                  title={t("profile.restoreToDisplay")}
                                >
                                  ↗
                                </span>
                              )}
                              {onMinimizePane && !minimized && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMinimizePane(profile.id, paneId);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.stopPropagation();
                                      onMinimizePane(profile.id, paneId);
                                    }
                                  }}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] text-chrome-text-faint opacity-0 transition-opacity hover:bg-chrome-hover-strong hover:text-chrome-text group-hover/session:opacity-100"
                                  title={t("profile.minimizeTerminal")}
                                >
                                  −
                                </span>
                              )}
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
                                className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] text-chrome-text-faint opacity-0 transition-opacity hover:bg-chrome-hover-strong hover:text-chrome-text group-hover/session:opacity-100"
                                title={t("pane.close")}
                              >
                                ✕
                              </span>
                            </>
                          )}
                        </button>
                        </div>
                        </div>
                      );
                    })}

                    {listedSessions.length === 0 && (
                      <p className="px-2 py-2.5 text-[10px] text-chrome-text-dim">{t("terminal.empty")}</p>

                    )}

                    <button
                      type="button"
                      disabled={busy || profileBusy || addingTerminal}
                      onClick={() => onAddTerminal(profile)}
                      className="mt-0.5 flex min-h-[30px] w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-[11px] text-chrome-text-faint transition-colors hover:bg-chrome-hover hover:text-chrome-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
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
                        <ToolLogo tool={defaultTool} size={12} />
                      </span>
                      {addingTerminal && isActive ? t("profile.opening") : t("terminal.new")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-chrome-border p-2">
          <button
            type="button"
            onClick={() => void window.api.openSettingsWindow()}
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[12px] text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text"
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

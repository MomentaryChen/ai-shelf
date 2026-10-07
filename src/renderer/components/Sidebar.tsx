import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  FolderOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  Plus,
  Minus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { WorkspaceSlideSwitcher } from "./WorkspaceSlideSwitcher";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "../i18n/LocaleProvider";
import { AccountSidebar } from "./AccountSidebar";
import { EmptyState } from "./EmptyState";
import { writeProfilePaneDrag } from "../terminal/profile-pane-display";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { ToolLogo } from "./ToolLogo";
import { profileToolLabel } from "../utils/available-tools";
import {
  profileAccentMarkerStyle,
  profileSidebarProfileActiveStyle,
  profileSidebarTerminalStyle,
} from "../utils/profile-colors";

function tryCloseTerminalOnMiddleClick(
  e: { button: number; preventDefault(): void; stopPropagation(): void },
  canClose: boolean,
  onClose: (() => void) | undefined,
): void {
  if (e.button !== 1 || !canClose || !onClose) return;
  e.preventDefault();
  e.stopPropagation();
  onClose();
}

export interface SidebarGroup {
  id: string;
  name: string;
  icon?: ReactNode;
}

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface SidebarProfile {
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface SidebarProfileItem {
  id: string;
  name: string;
  defaultTool?: string;
  terminalCount: number;
  broadcastInput?: boolean;
  accentColor?: string | null;
  savedCommands?: SidebarSavedCommandItem[];
  terminals?: SidebarTerminalItem[];
}

export interface SidebarSavedCommandItem {
  id: string;
  name: string;
  command: string;
  broadcast?: boolean;
}

export interface SidebarTerminalItem {
  id: string;
  profileId: string;
  tool?: string;
  label: string;
  description?: string;
  live?: boolean;
  minimized?: boolean;
}

interface SidebarProps {
  groups: SidebarGroup[];
  currentGroupId: string;
  profiles?: SidebarProfileItem[];
  activeProfileId?: string | null;
  activeTerminalId?: string | null;
  navItems?: SidebarNavItem[];
  activeNavId?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onGroupChange?: (groupId: string) => void;
  onCreateGroup?: () => void;
  onRenameGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onCreateProfile?: (groupId: string) => void;
  onProfileSelect?: (profileId: string) => void;
  onProfileReorder?: (dragProfileId: string, dropProfileId: string) => void;
  onProfileMoveToGroup?: (profileId: string, targetGroupId: string) => void;
  onProfileSettings?: (profileId: string) => void;
  onProfileOpenFolder?: (profileId: string) => void;
  onProfileAddTerminal?: (profileId: string) => void;
  onProfileToggleBroadcast?: (profileId: string, enabled: boolean) => void;
  onTerminalSelect?: (
    profileId: string,
    terminalId: string,
    opts?: { placeBeside?: boolean },
  ) => void;
  onTerminalRename?: (profileId: string, terminalId: string, title: string) => void;
  onTerminalClose?: (profileId: string, terminalId: string) => void;
  onTerminalMinimize?: (profileId: string, terminalId: string) => void;
  onTerminalRestore?: (profileId: string, terminalId: string) => void;
  onTerminalReorder?: (
    profileId: string,
    dragTerminalId: string,
    dropTerminalId: string,
    zone: "above" | "below",
  ) => void;
  onSavedCommandRun?: (
    profileId: string,
    command: string,
    broadcast: boolean,
  ) => void;
  onProfilePaneDragChange?: (active: boolean) => void;
  onNavChange?: (itemId: string) => void;
}

const defaultNavItems: SidebarNavItem[] = [];

export function Sidebar({
  groups,
  currentGroupId,
  profiles = [],
  activeProfileId = null,
  activeTerminalId = null,
  navItems = defaultNavItems,
  activeNavId = navItems[0]?.id,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  onGroupChange,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onCreateProfile,
  onProfileSelect,
  onProfileReorder,
  onProfileMoveToGroup,
  onProfileSettings,
  onProfileOpenFolder,
  onProfileAddTerminal,
  onProfileToggleBroadcast,
  onTerminalSelect,
  onTerminalRename,
  onTerminalClose,
  onTerminalMinimize,
  onTerminalRestore,
  onTerminalReorder,
  onSavedCommandRun,
  onProfilePaneDragChange,
  onNavChange,
}: SidebarProps) {
  const { t } = useLocale();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set());
  const [draggingProfileId, setDraggingProfileId] = useState<string | null>(null);
  const [dragOverProfileId, setDragOverProfileId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [draggingTerminal, setDraggingTerminal] = useState<{ profileId: string; terminalId: string } | null>(null);
  const [dragOverTerminal, setDragOverTerminal] = useState<{ profileId: string; terminalId: string; zone: "above" | "below" } | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpenId, setProfileMenuOpenId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const collapsed = controlledCollapsed ?? internalCollapsed;

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };
  const setCollapsed = (next: boolean) => {
    if (controlledCollapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  const currentGroup = useMemo(
    () => groups.find((g) => g.id === currentGroupId) ?? groups[0],
    [groups, currentGroupId],
  );

  useEffect(() => {
    if (!activeProfileId) return;
    setExpandedProfiles((prev) => new Set(prev).add(activeProfileId));
  }, [activeProfileId]);

  const filteredProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      return (p.terminals ?? []).some((t) => {
        const label = t.label?.toLowerCase() ?? "";
        const desc = t.description?.toLowerCase() ?? "";
        return label.includes(q) || desc.includes(q);
      });
    });
  }, [profiles, query]);

  const collapsedTerminals = useMemo(() => {
    if (!collapsed) return [];
    const active = profiles.find((p) => p.id === activeProfileId);
    if (active) return (active.terminals ?? []).slice(0, 24);
    return profiles.flatMap((p) => p.terminals ?? []).slice(0, 24);
  }, [collapsed, profiles, activeProfileId]);

  return (
    <aside
      className="flex h-full w-full flex-col border-r border-chrome-border bg-chrome-bg transition-all duration-200"
    >
      <div className="flex items-center justify-between border-b border-chrome-border/80 p-2">
        {!collapsed && (
          <span className="px-1 text-xs font-medium text-chrome-text-muted">{t("workspace.title")}</span>
        )}
        <IconTooltipButton
          icon={collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          collapsed={collapsed}
          onClick={() => setCollapsed(!collapsed)}
        />
      </div>

      <div className="p-2">
        <WorkspaceSlideSwitcher
          groups={groups}
          currentGroupId={currentGroupId}
          collapsed={collapsed}
          onGroupChange={onGroupChange}
        />
        {draggingProfileId && onProfileMoveToGroup && !collapsed && groups.length > 1 && (
          <div className="mt-1 space-y-1 rounded-lg border border-chrome-border-input bg-chrome-surface p-1">
            <div className="px-2 py-1 text-[11px] text-chrome-text-muted">{t("profile.dialog.groupHint")}</div>
            {groups
              .filter((group) => group.id !== currentGroup?.id)
              .map((group) => (
                <div
                  key={group.id}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-chrome-text-muted ${
                    dragOverGroupId === group.id ? "bg-chrome-hover text-chrome-text ring-2 ring-chrome-ui-accent/35" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverGroupId(group.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverGroupId === group.id) setDragOverGroupId(null);
                  }}
                  onDrop={(e) => {
                    if (!draggingProfileId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onProfileMoveToGroup(draggingProfileId, group.id);
                    setDraggingProfileId(null);
                    setDragOverGroupId(null);
                  }}
                >
                  {group.icon}
                  <span className="truncate">{group.name}</span>
                </div>
              ))}
          </div>
        )}
        {!collapsed && (
          <div className="mt-1.5 flex items-center gap-1 rounded-md border border-chrome-border-subtle bg-chrome-surface px-1 py-1">
            <IconAction title="New group" onClick={onCreateGroup}>
              <Plus className="h-3.5 w-3.5" />
            </IconAction>
            {currentGroup && (
              <>
                <IconAction title="Rename group" onClick={() => onRenameGroup?.(currentGroup.id)}>
                  <Settings2 className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction title="Delete group" onClick={() => onDeleteGroup?.(currentGroup.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconAction>
              </>
            )}
            <div className="ml-auto">
              <IconAction
                title="New profile"
                onClick={() => currentGroup && onCreateProfile?.(currentGroup.id)}
              >
                <Plus className="h-3.5 w-3.5" />
              </IconAction>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 min-h-0 space-y-1 overflow-y-auto px-2 py-1">
        {collapsed && (
          <div className="space-y-1">
            {collapsedTerminals.map((terminal) => {
              const terminalActive = terminal.id === activeTerminalId;
              const profileActive = terminal.profileId === activeProfileId;
              const canMiddleClose = profileActive && terminal.live === true;
              const collapsedTitle = terminal.description
                ? `${terminal.label}\n${terminal.description}`
                : terminal.label;
              return (
                <button
                  key={terminal.id}
                  type="button"
                  draggable={terminal.live === true}
                  onDragStart={(e) => {
                    if (terminal.live !== true) return;
                    writeProfilePaneDrag(e.dataTransfer, {
                      profileId: terminal.profileId,
                      paneId: terminal.id,
                    });
                    onProfilePaneDragChange?.(true);
                  }}
                  onDragEnd={() => onProfilePaneDragChange?.(false)}
                  title={
                    canMiddleClose
                      ? `${collapsedTitle} · ${t("profile.middleClickClose")}`
                      : collapsedTitle
                  }
                  onMouseDown={(e) =>
                    tryCloseTerminalOnMiddleClick(e, canMiddleClose, () =>
                      onTerminalClose?.(terminal.profileId, terminal.id),
                    )
                  }
                  onClick={() => onTerminalSelect?.(terminal.profileId, terminal.id)}
                  className={`flex h-8 w-full items-center justify-center rounded-md transition-colors ${
                    terminalActive
                      ? "bg-chrome-hover text-chrome-text"
                      : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text"
                  }`}
                >
                  <ToolLogo tool={terminal.tool ?? "shell"} size={14} />
                </button>
              );
            })}
          </div>
        )}
        {navItems.map((item) => {
          const active = item.id === activeNavId;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center rounded-lg px-2.5 py-2 text-sm transition-all duration-200 ${
                active
                  ? "bg-chrome-hover text-chrome-text"
                  : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text"
              } ${collapsed ? "justify-center px-0" : "gap-2.5"}`}
              onClick={() => onNavChange?.(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span>{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}

        {!collapsed && (
          <>
            <div className="mt-3 flex items-center gap-1 px-1">
              <div className="min-w-0 flex-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-chrome-text-muted">
                {t("profile.title")}
              </div>
              <IconAction
                title={searchOpen ? t("profile.hideSearch") : t("profile.showSearch")}
                onClick={() => {
                  if (searchOpen) {
                    closeSearch();
                    return;
                  }
                  setSearchOpen(true);
                }}
              >
                <Search
                  className={`h-3.5 w-3.5 ${searchOpen || query.trim() ? "text-chrome-accent-text" : ""}`}
                />
              </IconAction>
              <IconAction
                title={
                  filteredProfiles.length > 0 &&
                  filteredProfiles.every((p) => expandedProfiles.has(p.id))
                    ? t("profile.collapseAll")
                    : t("profile.expandAll")
                }
                onClick={() => {
                  const allExpanded =
                    filteredProfiles.length > 0 &&
                    filteredProfiles.every((p) => expandedProfiles.has(p.id));
                  if (allExpanded) {
                    setExpandedProfiles(new Set());
                    return;
                  }
                  setExpandedProfiles(new Set(filteredProfiles.map((p) => p.id)));
                }}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    filteredProfiles.length > 0 &&
                    filteredProfiles.every((p) => expandedProfiles.has(p.id))
                      ? "rotate-180"
                      : ""
                  }`}
                />
              </IconAction>
            </div>
            {searchOpen && (
              <div className="mt-1 flex items-center gap-1 px-1">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-chrome-text-dim" />
                  <Input
                    ref={searchInputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        closeSearch();
                      }
                    }}
                    placeholder={t("profile.search")}
                    aria-label={t("profile.search")}
                    className="h-7 border-chrome-border-input bg-chrome-surface pl-7 pr-7 text-[11px] text-chrome-text placeholder:text-chrome-text-dim focus-visible:border-chrome-border-focus"
                  />
                  {query.trim() ? (
                    <button
                      type="button"
                      title={t("profile.clearSearch")}
                      onClick={() => {
                        setQuery("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-chrome-text-dim transition-colors hover:bg-chrome-hover hover:text-chrome-text"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            <div className="mt-0.5 space-y-0.5">
              {filteredProfiles.length === 0 && (
                <EmptyState
                  tone="chrome"
                  compact
                  className="items-start px-1 py-2 text-left"
                  title={
                    query.trim() ? t("sidebar.noMatchingProfiles") : t("profile.empty")
                  }
                  description={query.trim() ? undefined : t("profile.emptyHint")}
                />
              )}
              {filteredProfiles.map((item) => {
                const active = item.id === activeProfileId;
                const expanded = expandedProfiles.has(item.id);
                const accent = item.accentColor;
                const menuOpen = profileMenuOpenId === item.id;
                const addTerminalLabel = item.defaultTool
                  ? t("profile.addTerminal", { tool: profileToolLabel(item.defaultTool) })
                  : t("profile.addTerminalPlain");
                return (
                  <div
                    key={item.id}
                    className={`rounded-md transition-colors ${
                      dragOverProfileId === item.id && draggingProfileId !== item.id
                        ? "ring-1 ring-chrome-ui-accent/40"
                        : ""
                    }`}
                    onDragOver={(e) => {
                      if (!draggingProfileId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverProfileId(item.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverProfileId === item.id) setDragOverProfileId(null);
                    }}
                    onDrop={(e) => {
                      if (!draggingProfileId || draggingProfileId === item.id) return;
                      e.preventDefault();
                      onProfileReorder?.(draggingProfileId, item.id);
                      setDraggingProfileId(null);
                      setDragOverProfileId(null);
                    }}
                  >
                    <div
                      className={`group/profile relative flex h-7 items-center gap-1 rounded-md pl-1.5 pr-0.5 ${
                        active
                          ? "text-chrome-text"
                          : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text"
                      }`}
                      style={active ? profileSidebarProfileActiveStyle(accent) : undefined}
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          setDraggingProfileId(item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggingProfileId(null);
                          setDragOverProfileId(null);
                          setDragOverGroupId(null);
                        }}
                        onClick={() => onProfileSelect?.(item.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12px] leading-tight"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-[3px]"
                          style={
                            accent
                              ? profileAccentMarkerStyle(accent, "sm")
                              : { backgroundColor: "var(--color-chrome-text-dim)" }
                          }
                        />
                        <span className="truncate font-medium">{item.name}</span>
                      </button>
                      <span
                        className={`inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-chrome-text-dim transition-opacity ${
                          menuOpen
                            ? "opacity-0"
                            : "opacity-100 group-hover/profile:opacity-0 group-focus-within/profile:opacity-0"
                        }`}
                      >
                        {item.terminalCount}
                      </span>
                      <div
                        className={`absolute right-5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 ${
                          menuOpen
                            ? "opacity-100"
                            : "opacity-0 pointer-events-none group-hover/profile:pointer-events-auto group-hover/profile:opacity-100 group-focus-within/profile:pointer-events-auto group-focus-within/profile:opacity-100"
                        }`}
                      >
                        <IconAction
                          title={addTerminalLabel}
                          onClick={() => onProfileAddTerminal?.(item.id)}
                        >
                          <Plus className="h-3 w-3" />
                        </IconAction>
                        <DropdownMenu
                          open={menuOpen}
                          onOpenChange={(open) =>
                            setProfileMenuOpenId(open ? item.id : null)
                          }
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title={t("profile.moreActions")}
                              aria-label={t("profile.moreActions")}
                              className="flex h-5 w-5 items-center justify-center rounded text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            side="bottom"
                            className="min-w-[168px] border-chrome-border bg-chrome-surface text-chrome-text"
                          >
                            <DropdownMenuItem
                              className="gap-2 text-[12px] focus:bg-chrome-hover focus:text-chrome-text"
                              onSelect={() => onProfileAddTerminal?.(item.id)}
                            >
                              <ToolLogo tool={item.defaultTool ?? "shell"} size={12} />
                              {addTerminalLabel}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-[12px] focus:bg-chrome-hover focus:text-chrome-text"
                              onSelect={() => onProfileOpenFolder?.(item.id)}
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                              {t("profile.openFolder")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-[12px] focus:bg-chrome-hover focus:text-chrome-text"
                              onSelect={() => onProfileSettings?.(item.id)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              {t("profile.settings")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-chrome-border-subtle" />
                            <DropdownMenuCheckboxItem
                              checked={item.broadcastInput ?? false}
                              className="text-[12px] focus:bg-chrome-hover focus:text-chrome-text"
                              title={t("profile.syncBroadcastTitle")}
                              onCheckedChange={(checked) =>
                                onProfileToggleBroadcast?.(item.id, checked === true)
                              }
                              onSelect={(e) => e.preventDefault()}
                            >
                              {t("profile.syncBroadcast")}
                            </DropdownMenuCheckboxItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <button
                        type="button"
                        title={expanded ? t("profile.collapse") : t("profile.expand")}
                        aria-label={expanded ? t("profile.collapse") : t("profile.expand")}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-chrome-text-dim transition-colors hover:bg-chrome-hover hover:text-chrome-text"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedProfiles((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }}
                      >
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                    {expanded && (
                      <div className="ml-2 space-y-0.5 border-l border-chrome-border-subtle py-0.5 pl-1.5">
                        {(item.terminals ?? []).length === 0 && (
                          <EmptyState
                            tone="chrome"
                            compact
                            className="items-start px-1 py-1 text-left"
                            title={t("terminal.empty")}
                            description={t("terminal.emptyHint")}
                          />
                        )}
                        {(item.terminals ?? []).map((terminal) => {
                          const terminalActive = terminal.id === activeTerminalId;
                          const profileActive = item.id === activeProfileId;
                          const canMiddleClose = profileActive && terminal.live === true;
                          const pathTitle = terminal.description ?? "";
                          const terminalTitle = terminal.description
                            ? `${terminal.label}\n${terminal.description}`
                            : terminal.label;
                          return (
                            <button
                              key={terminal.id}
                              type="button"
                              draggable={terminal.live === true}
                              onDragStart={(e) => {
                                if (terminal.live !== true) return;
                                writeProfilePaneDrag(e.dataTransfer, {
                                  profileId: terminal.profileId,
                                  paneId: terminal.id,
                                });
                                onProfilePaneDragChange?.(true);
                                setDraggingTerminal({
                                  profileId: terminal.profileId,
                                  terminalId: terminal.id,
                                });
                              }}
                              onDragEnd={() => {
                                onProfilePaneDragChange?.(false);
                                setDraggingTerminal(null);
                                setDragOverTerminal(null);
                              }}
                              onDragOver={(e) => {
                                if (
                                  !draggingTerminal ||
                                  draggingTerminal.profileId !== terminal.profileId ||
                                  draggingTerminal.terminalId === terminal.id
                                ) {
                                  return;
                                }
                                e.preventDefault();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const zone =
                                  e.clientY < rect.top + rect.height / 2 ? "above" : "below";
                                setDragOverTerminal({
                                  profileId: terminal.profileId,
                                  terminalId: terminal.id,
                                  zone,
                                });
                              }}
                              onDrop={(e) => {
                                if (
                                  !draggingTerminal ||
                                  draggingTerminal.profileId !== terminal.profileId ||
                                  draggingTerminal.terminalId === terminal.id ||
                                  !dragOverTerminal
                                ) {
                                  return;
                                }
                                e.preventDefault();
                                onTerminalReorder?.(
                                  terminal.profileId,
                                  draggingTerminal.terminalId,
                                  terminal.id,
                                  dragOverTerminal.zone,
                                );
                                setDraggingTerminal(null);
                                setDragOverTerminal(null);
                              }}
                              className={`group/term relative flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors ${
                                terminalActive
                                  ? "text-chrome-text"
                                  : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text"
                              }`}
                              style={profileSidebarTerminalStyle(accent, terminalActive)}
                              title={
                                canMiddleClose
                                  ? `${terminalTitle}\n${t("profile.middleClickClose")}`
                                  : terminalTitle
                              }
                              onMouseDown={(e) =>
                                tryCloseTerminalOnMiddleClick(e, canMiddleClose, () =>
                                  onTerminalClose?.(terminal.profileId, terminal.id),
                                )
                              }
                              onClick={(e) =>
                                onTerminalSelect?.(terminal.profileId, terminal.id, {
                                  placeBeside: e.shiftKey,
                                })
                              }
                            >
                              {dragOverTerminal?.profileId === terminal.profileId &&
                                dragOverTerminal.terminalId === terminal.id && (
                                  <span
                                    className={`pointer-events-none absolute left-1 right-1 h-0.5 rounded-full bg-chrome-ui-accent ${
                                      dragOverTerminal.zone === "above" ? "top-0" : "bottom-0"
                                    }`}
                                  />
                                )}
                              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                <ToolLogo tool={terminal.tool ?? "shell"} size={12} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1">
                                  {terminal.live && onTerminalRename ? (
                                    <EditablePaneTitle
                                      label={terminal.label}
                                      onRename={(title) =>
                                        onTerminalRename(terminal.profileId, terminal.id, title)
                                      }
                                      className="truncate text-[11px] leading-tight"
                                      inputClassName="text-[11px]"
                                    />
                                  ) : (
                                    <span className="truncate text-[11px] leading-tight">
                                      {terminal.label}
                                    </span>
                                  )}
                                  {terminal.live && (
                                    <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/term:opacity-100">
                                      {terminal.minimized ? (
                                        <IconAction
                                          title="Restore pane"
                                          onClick={() =>
                                            onTerminalRestore?.(terminal.profileId, terminal.id)
                                          }
                                        >
                                          <ArrowUpRight className="h-3 w-3" />
                                        </IconAction>
                                      ) : (
                                        <IconAction
                                          title="Minimize pane"
                                          onClick={() =>
                                            onTerminalMinimize?.(terminal.profileId, terminal.id)
                                          }
                                        >
                                          <Minus className="h-3 w-3" />
                                        </IconAction>
                                      )}
                                      <IconAction
                                        title={t("pane.close")}
                                        onClick={() =>
                                          onTerminalClose?.(terminal.profileId, terminal.id)
                                        }
                                      >
                                        <X className="h-3 w-3" />
                                      </IconAction>
                                    </span>
                                  )}
                                </span>
                                {terminal.description ? (
                                  <span
                                    className="mt-px block truncate text-[10px] leading-tight text-chrome-text-dim"
                                    title={pathTitle}
                                  >
                                    {terminal.description}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                        {(item.savedCommands ?? []).length > 0 && (
                          <div className="mt-0.5 space-y-0.5 border-t border-chrome-border-subtle/60 pt-0.5">
                            <p className="px-1.5 text-[9px] font-medium uppercase tracking-wide text-chrome-text-dim">
                              {t("sidebar.savedCommands")}
                            </p>
                            {(item.savedCommands ?? []).map((snippet) => (
                              <button
                                key={snippet.id}
                                type="button"
                                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[11px] text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text"
                                title={snippet.command}
                                onClick={() =>
                                  onSavedCommandRun?.(
                                    item.id,
                                    snippet.command,
                                    snippet.broadcast ?? false,
                                  )
                                }
                              >
                                <span className="shrink-0 text-[10px]" aria-hidden>
                                  {snippet.broadcast ? "📡" : "⚡"}
                                </span>
                                <span className="truncate">{snippet.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-chrome-border p-2 space-y-1">
        <button
          type="button"
          className={`flex w-full items-center rounded-lg px-2.5 py-2 text-sm text-chrome-text-muted transition-all duration-200 hover:bg-chrome-hover hover:text-chrome-text ${
            collapsed ? "justify-center px-0" : "gap-2.5"
          }`}
          onClick={() => void window.api.openSettingsWindow()}
          title={collapsed ? t("sidebar.settings") : undefined}
        >
          <Settings2 className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">{t("sidebar.settings")}</span>}
        </button>
        <AccountSidebar collapsed={collapsed} />
      </div>
    </aside>
  );
}

function IconAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="flex h-5 w-5 items-center justify-center rounded text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text"
    >
      {children}
    </button>
  );
}

function IconTooltipButton({
  icon,
  label,
  collapsed,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="group relative flex h-8 w-8 items-center justify-center rounded-lg text-chrome-text-muted transition-all duration-200 hover:bg-chrome-hover hover:text-chrome-text"
      onClick={onClick}
      title={label}
    >
      {icon}
      {collapsed && (
        <span className="pointer-events-none absolute left-10 top-1/2 hidden -translate-y-1/2 rounded-md bg-chrome-surface px-2 py-1 text-xs text-chrome-text shadow-pop group-hover:block">
          {label}
        </span>
      )}
    </button>
  );
}

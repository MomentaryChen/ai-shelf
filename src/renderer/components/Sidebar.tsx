import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FolderOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  FolderKanban,
  Monitor,
  Plus,
  Settings2,
  Trash2,
  UserCircle2,
} from "lucide-react";

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
  terminalCount: number;
  broadcastInput?: boolean;
  accentColor?: string | null;
  terminals?: SidebarTerminalItem[];
}

export interface SidebarTerminalItem {
  id: string;
  profileId: string;
  label: string;
  description?: string;
}

interface SidebarProps {
  groups: SidebarGroup[];
  currentGroupId: string;
  profiles?: SidebarProfileItem[];
  activeProfileId?: string | null;
  activeTerminalId?: string | null;
  navItems?: SidebarNavItem[];
  activeNavId?: string;
  profile: SidebarProfile;
  terminalOnline?: boolean;
  terminalLabel?: string;
  showAccountSection?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onGroupChange?: (groupId: string) => void;
  onCreateGroup?: () => void;
  onRenameGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onCreateProfile?: (groupId: string) => void;
  onProfileSelect?: (profileId: string) => void;
  onProfileReorder?: (dragProfileId: string, dropProfileId: string) => void;
  onProfileSettings?: (profileId: string) => void;
  onProfileOpenFolder?: (profileId: string) => void;
  onProfileAddTerminal?: (profileId: string) => void;
  onProfileToggleBroadcast?: (profileId: string, enabled: boolean) => void;
  onTerminalSelect?: (profileId: string, terminalId: string) => void;
  onNavChange?: (itemId: string) => void;
  onTerminalClick?: () => void;
  onProfileMenuAction?: (action: "account" | "billing" | "logout") => void;
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
  profile,
  terminalOnline = true,
  terminalLabel = "Terminal Console",
  showAccountSection = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  onGroupChange,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onCreateProfile,
  onProfileSelect,
  onProfileReorder,
  onProfileSettings,
  onProfileOpenFolder,
  onProfileAddTerminal,
  onProfileToggleBroadcast,
  onTerminalSelect,
  onNavChange,
  onTerminalClick,
  onProfileMenuAction,
}: SidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set());
  const [draggingProfileId, setDraggingProfileId] = useState<string | null>(null);
  const [dragOverProfileId, setDragOverProfileId] = useState<string | null>(null);
  const groupMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = (next: boolean) => {
    if (controlledCollapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  const currentGroup = useMemo(
    () => groups.find((g) => g.id === currentGroupId) ?? groups[0],
    [groups, currentGroupId],
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (groupMenuRef.current && !groupMenuRef.current.contains(target)) setGroupOpen(false);
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!activeProfileId) return;
    setExpandedProfiles((prev) => new Set(prev).add(activeProfileId));
  }, [activeProfileId]);

  return (
    <aside
      className={`flex h-full flex-col border-r border-chrome-border bg-chrome-bg transition-all duration-200 ${
        collapsed ? "w-16" : "w-72"
      }`}
    >
      <div className="flex items-center justify-between border-b border-chrome-border/80 p-2">
        {!collapsed && <span className="px-1 text-xs font-medium text-chrome-text-muted">Workspace</span>}
        <IconTooltipButton
          icon={collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          collapsed={collapsed}
          onClick={() => setCollapsed(!collapsed)}
        />
      </div>

      <div className="p-2" ref={groupMenuRef}>
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-lg border border-chrome-border-input bg-chrome-surface px-2.5 py-2 text-left text-sm transition-all duration-200 hover:bg-chrome-hover ${
            collapsed ? "justify-center px-0" : ""
          }`}
          onClick={() => setGroupOpen((v) => !v)}
          title={collapsed ? currentGroup?.name : undefined}
          aria-expanded={groupOpen}
        >
          {currentGroup?.icon ?? <FolderKanban className="h-4 w-4 text-chrome-text" />}
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-chrome-text">{currentGroup?.name ?? "No workspace"}</div>
                <div className="truncate text-xs text-chrome-text-muted">Group Switcher</div>
              </div>
              <ChevronDown className={`h-4 w-4 text-chrome-text-muted transition-transform ${groupOpen ? "rotate-180" : ""}`} />
            </>
          )}
        </button>
        {groupOpen && !collapsed && (
          <div className="mt-1 space-y-1 rounded-lg border border-chrome-border-input bg-chrome-surface p-1">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-all duration-200 hover:bg-chrome-hover ${
                  group.id === currentGroup?.id ? "bg-chrome-hover text-chrome-text" : "text-chrome-text-muted"
                }`}
                onClick={() => {
                  onGroupChange?.(group.id);
                  setGroupOpen(false);
                }}
              >
                {group.icon ?? <FolderKanban className="h-4 w-4" />}
                <span className="truncate">{group.name}</span>
              </button>
            ))}
          </div>
        )}
        {!collapsed && (
          <div className="mt-1.5 flex items-center gap-1">
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

      <nav className="flex-1 space-y-1 px-2 py-1">
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
            <div className="mt-3 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-chrome-text-muted">
              2. Profile
            </div>
            <div className="mt-1 space-y-1">
              {profiles.length === 0 && (
                <p className="rounded-lg px-2 py-1.5 text-xs text-chrome-text-muted">No profiles</p>
              )}
              {profiles.map((item) => {
                const active = item.id === activeProfileId;
                const expanded = expandedProfiles.has(item.id);
                const accent = item.accentColor;
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border border-transparent ${
                      dragOverProfileId === item.id && draggingProfileId !== item.id
                        ? "ring-2 ring-accent/35"
                        : ""
                    }`}
                    style={accent ? { borderColor: `${accent}44` } : undefined}
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
                      }}
                      onClick={() => onProfileSelect?.(item.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-all duration-200 ${
                        active
                          ? "bg-chrome-hover text-chrome-text"
                          : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text"
                      }`}
                      style={active && accent ? { backgroundColor: `${accent}1a` } : undefined}
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        {accent && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />}
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-chrome-text-muted">
                        {item.terminalCount}
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedProfiles((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                        />
                      </span>
                    </button>
                    {expanded && (
                      <div className="mt-0.5 space-y-1 pl-2">
                        {(item.terminals ?? []).length === 0 && (
                          <p className="rounded-lg px-2 py-1.5 text-xs text-chrome-text-muted">No terminals</p>
                        )}
                        {(item.terminals ?? []).map((terminal) => {
                          const terminalActive = terminal.id === activeTerminalId;
                          return (
                            <button
                              key={terminal.id}
                              type="button"
                              className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs transition-all duration-200 ${
                                terminalActive
                                  ? "bg-chrome-hover text-chrome-text"
                                  : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text"
                              }`}
                              style={terminalActive && accent ? { backgroundColor: `${accent}14` } : undefined}
                              onClick={() => onTerminalSelect?.(terminal.profileId, terminal.id)}
                            >
                              <span className="truncate">{terminal.label}</span>
                              {terminal.description && (
                                <span className="ml-1 truncate text-[10px] text-chrome-text-muted">
                                  · {terminal.description}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        <div className="flex items-center gap-1 px-1 py-0.5">
                          <IconAction title="Add terminal" onClick={() => onProfileAddTerminal?.(item.id)}>
                            <Plus className="h-3.5 w-3.5" />
                          </IconAction>
                          <IconAction title="Open folder" onClick={() => onProfileOpenFolder?.(item.id)}>
                            <FolderOpen className="h-3.5 w-3.5" />
                          </IconAction>
                          <label className="ml-1 inline-flex items-center gap-1 text-[10px] text-chrome-text-muted">
                            <input
                              type="checkbox"
                              checked={item.broadcastInput ?? false}
                              onChange={(e) =>
                                onProfileToggleBroadcast?.(item.id, e.target.checked)
                              }
                              className="h-3 w-3 rounded accent-accent"
                            />
                            broadcast
                          </label>
                          <div className="ml-auto">
                            <IconAction
                              title="Profile settings"
                              onClick={() => onProfileSettings?.(item.id)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </IconAction>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-chrome-border p-2">
        <button
          type="button"
          className={`flex w-full items-center rounded-lg px-2.5 py-2 text-sm transition-all duration-200 hover:bg-chrome-hover ${
            collapsed ? "justify-center px-0" : "gap-2.5"
          }`}
          onClick={onTerminalClick}
          title={collapsed ? terminalLabel : undefined}
        >
          <Monitor className="h-4 w-4 text-chrome-text" />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-chrome-text">{terminalLabel}</div>
                <div className="truncate text-xs text-chrome-text-muted">System Console</div>
              </div>
              <Circle
                className={`h-2.5 w-2.5 fill-current ${
                  terminalOnline ? "text-green-500" : "text-red-500"
                }`}
              />
            </>
          )}
          {collapsed && (
            <Circle
              className={`absolute ml-4 mt-4 h-2.5 w-2.5 fill-current ${
                terminalOnline ? "text-green-500" : "text-red-500"
              }`}
            />
          )}
        </button>
      </div>

      {showAccountSection && (
        <div className="border-t border-chrome-border p-2" ref={accountMenuRef}>
          <div className="relative">
            <button
              type="button"
              className={`flex w-full items-center rounded-lg px-2.5 py-2 transition-all duration-200 hover:bg-chrome-hover ${
                collapsed ? "justify-center px-0" : "gap-2.5"
              }`}
              onClick={() => setAccountMenuOpen((v) => !v)}
              title={collapsed ? profile.name : undefined}
              aria-expanded={accountMenuOpen}
            >
              <Avatar name={profile.name} avatarUrl={profile.avatarUrl} />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm text-chrome-text">{profile.name}</div>
                    <div className="truncate text-xs text-chrome-text-muted">{profile.email}</div>
                  </div>
                  <UserCircle2 className="h-4 w-4 text-chrome-text-muted" />
                </>
              )}
            </button>
            {accountMenuOpen && (
              <div className={`absolute z-30 w-44 rounded-lg border border-chrome-border-input bg-chrome-surface p-1 shadow-xl ${collapsed ? "bottom-0 left-14" : "bottom-12 right-0"}`}>
                <MenuAction label="Account" onClick={() => onProfileMenuAction?.("account")} />
                <MenuAction label="Billing" onClick={() => onProfileMenuAction?.("billing")} />
                <MenuAction label="Logout" onClick={() => onProfileMenuAction?.("logout")} danger />
              </div>
            )}
          </div>
        </div>
      )}
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
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-chrome-text-muted transition-all duration-200 hover:bg-chrome-hover hover:text-chrome-text"
    >
      {children}
    </button>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const fallback = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="h-8 w-8 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-chrome-hover text-xs font-semibold text-chrome-text">
      {fallback || "U"}
    </div>
  );
}

function MenuAction({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-all duration-200 hover:bg-chrome-hover ${
        danger ? "text-red-400" : "text-chrome-text-muted"
      }`}
      onClick={onClick}
    >
      {label}
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
        <span className="pointer-events-none absolute left-10 top-1/2 hidden -translate-y-1/2 rounded-md bg-chrome-surface px-2 py-1 text-xs text-chrome-text shadow-lg group-hover:block">
          {label}
        </span>
      )}
    </button>
  );
}

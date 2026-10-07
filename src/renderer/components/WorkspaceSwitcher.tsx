import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "../i18n/LocaleProvider";
import { groupIndexById, stepIndex } from "../utils/workspace-slide";

const WHEEL_LOCK_MS = 280;

export interface WorkspaceSwitcherGroup {
  id: string;
  name: string;
  icon?: ReactNode;
  profileCount?: number;
}

interface WorkspaceSwitcherProps {
  groups: WorkspaceSwitcherGroup[];
  currentGroupId: string;
  collapsed?: boolean;
  onGroupChange?: (groupId: string) => void;
  onCreateGroup?: () => void;
  onRenameGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
}

function initialOf(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : "?";
}

function WorkspaceAvatar({
  group,
  active,
  size = "md",
}: {
  group: WorkspaceSwitcherGroup | undefined;
  active: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-[13px]";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors duration-200 ${box} ${
        active
          ? "bg-chrome-ui-accent/15 text-chrome-accent-text"
          : "bg-chrome-hover text-chrome-text-muted"
      }`}
    >
      {group?.icon ?? initialOf(group?.name ?? "")}
    </span>
  );
}

export function WorkspaceSwitcher({
  groups,
  currentGroupId,
  collapsed = false,
  onGroupChange,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}: WorkspaceSwitcherProps) {
  const { t } = useLocale();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wheelLock = useRef(false);
  const wheelTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const index = groupIndexById(groups, currentGroupId);
  const current = groups[index];
  const canCycle = groups.length > 1;

  const profileCountLabel = (count: number | undefined) =>
    count == null
      ? null
      : count === 0
        ? t("workspace.profileCountZero")
        : count === 1
          ? t("workspace.profileCountOne")
          : t("workspace.profileCount", { count });

  const go = useCallback(
    (delta: number) => {
      if (groups.length < 2) return;
      const id = groups[stepIndex(groups.length, index, delta)]?.id;
      if (id && id !== currentGroupId) onGroupChange?.(id);
    },
    [currentGroupId, groups, index, onGroupChange],
  );

  useEffect(() => () => window.clearTimeout(wheelTimer.current), []);

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (groups.length < 2 || wheelLock.current) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 8) return;
      e.preventDefault();
      e.stopPropagation();
      wheelLock.current = true;
      go(delta > 0 ? 1 : -1);
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => {
        wheelLock.current = false;
      }, WHEEL_LOCK_MS);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [go, groups.length]);

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  const name = current?.name ?? t("workspace.empty");
  const countLabel = profileCountLabel(current?.profileCount);
  const position = canCycle
    ? t("workspace.position", { current: index + 1, total: groups.length })
    : null;
  const subtitle = [countLabel, position].filter(Boolean).join(" · ");
  const triggerTitle = canCycle ? `${name} — ${t("workspace.cycleHint")}` : name;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          title={triggerTitle}
          aria-label={`${t("workspace.groupSwitcher")}: ${name}`}
          onKeyDown={onTriggerKeyDown}
          className={
            collapsed
              ? "flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition-colors duration-200 hover:bg-chrome-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-border-focus"
              : `flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-border-focus ${
                  open
                    ? "border-chrome-border-focus bg-chrome-hover"
                    : "border-chrome-border-input bg-chrome-surface hover:bg-chrome-hover"
                }`
          }
        >
          <WorkspaceAvatar group={current} active />
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] leading-tight font-medium text-chrome-text">
                  {name}
                </span>
                {subtitle && (
                  <span className="truncate text-[11px] leading-tight tabular-nums text-chrome-text-muted">
                    {subtitle}
                  </span>
                )}
              </span>
              <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-chrome-text-muted" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? "right" : "bottom"}
        sideOffset={6}
        className="max-h-[min(70vh,420px)] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px] overflow-y-auto border-chrome-border bg-chrome-surface text-chrome-text"
      >
        <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-chrome-text-muted">
          {t("workspace.switchTo")}
        </DropdownMenuLabel>
        {groups.length === 0 && (
          <div className="px-2 py-2 text-[12px] text-chrome-text-muted">{t("workspace.empty")}</div>
        )}
        {groups.map((group) => {
          const active = group.id === current?.id;
          const count = profileCountLabel(group.profileCount);
          return (
            <DropdownMenuItem
              key={group.id}
              onSelect={() => {
                if (!active) onGroupChange?.(group.id);
              }}
              aria-current={active ? "true" : undefined}
              className="gap-2.5 py-1.5 text-[12.5px] focus:bg-chrome-hover focus:text-chrome-text"
            >
              <WorkspaceAvatar group={group} active={active} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate ${active ? "font-medium" : ""}`}>{group.name}</span>
                {count && (
                  <span className="text-[11px] leading-tight tabular-nums text-chrome-text-muted">
                    {count}
                  </span>
                )}
              </span>
              {active && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-chrome-accent-text" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="bg-chrome-border-subtle" />
        <DropdownMenuItem
          onSelect={() => onCreateGroup?.()}
          className="gap-2 text-[12.5px] focus:bg-chrome-hover focus:text-chrome-text"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {t("workspace.newWorkspace")}
        </DropdownMenuItem>
        {current && (
          <>
            <DropdownMenuItem
              onSelect={() => onRenameGroup?.(current.id)}
              className="gap-2 text-[12.5px] focus:bg-chrome-hover focus:text-chrome-text"
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
              <span className="truncate">{t("workspace.rename", { name: current.name })}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onDeleteGroup?.(current.id)}
              className="gap-2 text-[12.5px] text-fail focus:bg-chrome-hover focus:text-fail"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              <span className="truncate">{t("workspace.delete", { name: current.name })}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

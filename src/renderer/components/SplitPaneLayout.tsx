import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  SplitSquareHorizontal,
  SplitSquareVertical,
  Minus,
  X,
  ExternalLink,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { DragHandle } from "./ProfileSidebarUI";
import { PaneDropOverlay } from "./PaneDropOverlay";
import { paneDisplayLabel } from "../utils/pane-label";
import { ResizeDivider } from "./ResizeDivider";
import { hitPaneDropZone, type PaneDropZone } from "../terminal/pane-drop-zone";
import { hasProfilePaneDrag, readProfilePaneDrag } from "../terminal/profile-pane-display";
import { formatDroppedPaths, isOsFileDrag } from "../terminal/file-drop";
import { pasteToTerminalSession } from "../terminal/terminal-session-actions";
import {
  collectPanes,
  maximizedSplitSide,
  type LayoutNode,
  type PaneInfo,
  type SplitDirection,
} from "../terminal/split-tree";
import { formatPaneCwdShort } from "../utils/pane-cwd";
import { useLocale } from "../i18n/LocaleProvider";
import {
  profilePaneChromeStyle,
  profilePaneHeaderStyle,
} from "../utils/profile-colors";
import { PaneAgentStatusDot } from "./PaneAgentStatusDot";
import type { PaneAgentStatus } from "../../shared/pane-agent-state.js";
import { PaneGitBranch } from "./TerminalGitStatus";

const DIVIDER_PX = 10;
/** How long the in-pane broadcast hint stays up after broadcast turns on. */
const BROADCAST_HINT_MS = 4000;

function clampRatio(ratio: number): number {
  return Math.min(0.9, Math.max(0.1, ratio));
}

/**
 * Pixels taken by dividers nested along `direction`. Used as flex-basis so the
 * ratio splits the remaining space; otherwise deeper panes in a row shrink by
 * one divider per level.
 */
function nestedDividerPx(node: LayoutNode, direction: SplitDirection): number {
  if (node.kind !== "split" || node.direction !== direction) return 0;
  return (
    DIVIDER_PX + nestedDividerPx(node.first, direction) + nestedDividerPx(node.second, direction)
  );
}

interface Props {
  node: LayoutNode;
  focusedPaneId: string | null;
  bg: string;
  onFocusPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onMinimizePane?: (paneId: string) => void;
  onSplitPane: (paneId: string, direction: SplitDirection) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onRenamePane?: (paneId: string, title: string) => void;
  onPaneCwdClick?: (paneId: string) => void;
  onMovePane?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  onProfilePaneDrop?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  /** True while dragging a tab from the profile sidebar (enables drop overlay over xterm). */
  sidebarPaneDragActive?: boolean;
  renderTerminal: (pane: PaneInfo, focused: boolean) => ReactNode;
  profileAccentColor?: string | null;
  broadcastActive?: boolean;
  broadcastPaneCount?: number;
  paneAgentStates?: Record<string, PaneAgentStatus>;
  /** Pane id → title (numbered when several panes share a tool). */
  paneLabels?: Record<string, string>;
  /**
   * Open a pane in its own window. "drag" = the header drag ended outside the
   * page (the main process then checks the cursor is outside every app window).
   */
  onPopOutPane?: (paneId: string, trigger: PanePopOutTrigger, size: PanePopOutSize) => void;
  /**
   * Show only this pane (view-only; see `effectiveMaximizedPaneId`). Other panes
   * stay mounted but hidden so their PTYs and xterm buffers keep running.
   */
  maximizedPaneId?: string | null;
  onToggleMaximizePane?: (paneId: string) => void;
  /** Formatted maximize shortcut for tooltips (e.g. `Ctrl+Shift+Enter`). */
  maximizeShortcutKeys?: string;
}

export type PanePopOutTrigger = "drag" | "menu";
export type PanePopOutSize = { width: number; height: number };

type ProfileDragOver = { targetPaneId: string; zone: PaneDropZone };

type PaneDragState = {
  draggingPaneId: string | null;
  dragOverPaneId: string | null;
  dropZone: PaneDropZone | null;
  profileDragOver: ProfileDragOver | null;
  canReorder: boolean;
  /** Several panes are on screen and one of them has focus: fade the others back. */
  dimUnfocused: boolean;
  setDraggingPaneId: (id: string | null) => void;
  setDragOverPaneId: (id: string | null) => void;
  setDropZone: (zone: PaneDropZone | null) => void;
  setProfileDragOver: (over: ProfileDragOver | null) => void;
  onMovePane?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  onProfilePaneDrop?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  onPopOutPane?: Props["onPopOutPane"];
};

export function SplitPaneLayout(props: Props) {
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<PaneDropZone | null>(null);
  const [profileDragOver, setProfileDragOver] = useState<ProfileDragOver | null>(null);
  const paneCount = collectPanes(props.node).length;

  useEffect(() => {
    if (!props.sidebarPaneDragActive) setProfileDragOver(null);
  }, [props.sidebarPaneDragActive]);
  const canReorder = paneCount > 1 && Boolean(props.onMovePane);
  // Broadcast types into every pane, and a maximized pane hides the rest, so
  // neither case has a single "current" pane worth singling out.
  const dimUnfocused =
    paneCount > 1 &&
    !props.broadcastActive &&
    !props.maximizedPaneId &&
    collectPanes(props.node).some((p) => p.id === props.focusedPaneId);

  const drag: PaneDragState = {
    draggingPaneId,
    dragOverPaneId,
    dropZone,
    profileDragOver,
    canReorder,
    dimUnfocused,
    setDraggingPaneId,
    setDragOverPaneId,
    setDropZone,
    setProfileDragOver,
    onMovePane: props.onMovePane,
    onProfilePaneDrop: props.onProfilePaneDrop,
    onPopOutPane: props.onPopOutPane,
  };

  return (
    <SplitPaneLayoutInner
      {...props}
      onToggleMaximizePane={paneCount > 1 ? props.onToggleMaximizePane : undefined}
      drag={drag}
    />
  );
}

function SplitPaneLayoutInner({
  node,
  focusedPaneId,
  bg,
  onFocusPane,
  onClosePane,
  onMinimizePane,
  onSplitPane,
  onResizeSplit,
  onRenamePane,
  onPaneCwdClick,
  renderTerminal,
  sidebarPaneDragActive = false,
  profileAccentColor = null,
  broadcastActive = false,
  broadcastPaneCount = 0,
  paneAgentStates,
  paneLabels,
  maximizedPaneId = null,
  onToggleMaximizePane,
  maximizeShortcutKeys,
  drag,
}: Props & { drag: PaneDragState }) {
  if (node.kind === "pane") {
    const focused = focusedPaneId === node.pane.id;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch">
        <WarpPaneShell
          key={node.pane.sessionId}
          pane={node.pane}
          focused={focused}
          bg={bg}
          profileAccentColor={profileAccentColor}
          broadcastActive={broadcastActive}
          broadcastPaneCount={broadcastPaneCount}
          paneAgentStatus={paneAgentStates?.[node.pane.id]}
          label={paneLabels?.[node.pane.id] ?? paneDisplayLabel(node.pane)}
          drag={drag}
          onFocus={() => onFocusPane(node.pane.id)}
          onClose={() => onClosePane(node.pane.id)}
          onMinimize={onMinimizePane ? () => onMinimizePane(node.pane.id) : undefined}
          onSplit={(dir) => onSplitPane(node.pane.id, dir)}
          onRename={
            onRenamePane ? (title) => onRenamePane(node.pane.id, title) : undefined
          }
          onCwdClick={onPaneCwdClick ? () => onPaneCwdClick(node.pane.id) : undefined}
          sidebarPaneDragActive={sidebarPaneDragActive}
          maximized={maximizedPaneId === node.pane.id}
          onToggleMaximize={
            onToggleMaximizePane ? () => onToggleMaximizePane(node.pane.id) : undefined
          }
          maximizeShortcutKeys={maximizeShortcutKeys}
        >
          {renderTerminal(node.pane, focused)}
        </WarpPaneShell>
      </div>
    );
  }

  const horizontal = node.direction === "horizontal";
  const ratio = clampRatio(node.ratio);
  const rest = 1 - ratio;
  // Maximized: same element tree (nothing unmounts), the other side and the
  // divider are display:none and the kept side takes the full split.
  const keep = maximizedSplitSide(node, maximizedPaneId);
  const sideStyle = (side: "first" | "second", grow: number, basisPx: number) =>
    keep === null
      ? { flex: `${grow} 1 ${basisPx}px` }
      : keep === side
        ? { flex: "1 1 0px" }
        : { display: "none" };

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-1 overflow-hidden ${
        horizontal ? "flex-row" : "flex-col"
      }`}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden self-stretch"
        style={sideStyle("first", ratio, nestedDividerPx(node.first, node.direction))}
      >
        <SplitPaneLayoutInner
          node={node.first}
          focusedPaneId={focusedPaneId}
          bg={bg}
          onFocusPane={onFocusPane}
          onClosePane={onClosePane}
          onMinimizePane={onMinimizePane}
          onSplitPane={onSplitPane}
          onResizeSplit={onResizeSplit}
          onRenamePane={onRenamePane}
          onPaneCwdClick={onPaneCwdClick}
          renderTerminal={renderTerminal}
          sidebarPaneDragActive={sidebarPaneDragActive}
          profileAccentColor={profileAccentColor}
          broadcastActive={broadcastActive}
          broadcastPaneCount={broadcastPaneCount}
          paneAgentStates={paneAgentStates}
          paneLabels={paneLabels}
          maximizedPaneId={maximizedPaneId}
          onToggleMaximizePane={onToggleMaximizePane}
          maximizeShortcutKeys={maximizeShortcutKeys}
          drag={drag}
        />
      </div>

      <div
        className={`shrink-0 ${horizontal ? "w-2.5 self-stretch" : "h-2.5 w-full"}`}
        style={
          keep !== null
            ? { display: "none" }
            : horizontal
              ? { width: DIVIDER_PX }
              : { height: DIVIDER_PX }
        }
      >
        <ResizeDivider
          mode="ratio"
          orientation={node.direction}
          onResize={(r) => onResizeSplit(node.id, r)}
        />
      </div>

      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden self-stretch"
        style={sideStyle("second", rest, nestedDividerPx(node.second, node.direction))}
      >
        <SplitPaneLayoutInner
          node={node.second}
          focusedPaneId={focusedPaneId}
          bg={bg}
          onFocusPane={onFocusPane}
          onClosePane={onClosePane}
          onMinimizePane={onMinimizePane}
          onSplitPane={onSplitPane}
          onResizeSplit={onResizeSplit}
          onRenamePane={onRenamePane}
          onPaneCwdClick={onPaneCwdClick}
          renderTerminal={renderTerminal}
          sidebarPaneDragActive={sidebarPaneDragActive}
          profileAccentColor={profileAccentColor}
          broadcastActive={broadcastActive}
          broadcastPaneCount={broadcastPaneCount}
          paneAgentStates={paneAgentStates}
          paneLabels={paneLabels}
          maximizedPaneId={maximizedPaneId}
          onToggleMaximizePane={onToggleMaximizePane}
          maximizeShortcutKeys={maximizeShortcutKeys}
          drag={drag}
        />
      </div>
    </div>
  );
}

function WarpPaneShell({
  pane,
  focused,
  bg,
  profileAccentColor,
  broadcastActive = false,
  broadcastPaneCount = 0,
  paneAgentStatus,
  label,
  drag,
  onFocus,
  onClose,
  onMinimize,
  onSplit,
  onRename,
  onCwdClick,
  sidebarPaneDragActive = false,
  maximized = false,
  onToggleMaximize,
  maximizeShortcutKeys,
  children,
}: {
  pane: PaneInfo;
  focused: boolean;
  bg: string;
  profileAccentColor?: string | null;
  broadcastActive?: boolean;
  broadcastPaneCount?: number;
  paneAgentStatus?: PaneAgentStatus;
  label: string;
  sidebarPaneDragActive?: boolean;
  drag: PaneDragState;
  onFocus: () => void;
  onClose: () => void;
  onMinimize?: () => void;
  onSplit: (dir: SplitDirection) => void;
  onRename?: (title: string) => void;
  onCwdClick?: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  maximizeShortcutKeys?: string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const cwdShort = formatPaneCwdShort(pane.cwd);
  const chromeStyle = profilePaneChromeStyle(profileAccentColor, focused);
  const headerStyle = profilePaneHeaderStyle(profileAccentColor, focused);
  const shellRef = useRef<HTMLDivElement>(null);
  const {
    draggingPaneId,
    dragOverPaneId,
    dropZone,
    profileDragOver,
    canReorder,
    dimUnfocused,
    setDraggingPaneId,
    setDragOverPaneId,
    setDropZone,
    setProfileDragOver,
    onMovePane,
    onProfilePaneDrop,
    onPopOutPane,
  } = drag;
  const dimmed = dimUnfocused && !focused;
  const titleClass = `min-w-0 max-w-[45%] shrink truncate text-[12px] font-medium transition-colors ${
    dimmed ? "text-chrome-text-muted" : "text-chrome-text"
  }`;
  const popOut = (trigger: PanePopOutTrigger) => {
    if (!onPopOutPane) return;
    const rect = shellRef.current?.getBoundingClientRect();
    onPopOutPane(pane.id, trigger, {
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    });
  };
  const isDragOver = dragOverPaneId === pane.id && draggingPaneId !== pane.id;
  const isProfileDragOver = profileDragOver?.targetPaneId === pane.id;
  const activeDropZone = isProfileDragOver ? profileDragOver.zone : dropZone;
  const isDragging = draggingPaneId === pane.id;
  const [broadcastEnter, setBroadcastEnter] = useState(false);
  // The in-pane hint covers the last terminal rows, so it only announces the
  // switch and then fades; the header badge and border keep showing the state.
  const [broadcastHint, setBroadcastHint] = useState(false);
  const prevBroadcastRef = useRef(broadcastActive);

  useEffect(() => {
    if (broadcastActive && !prevBroadcastRef.current) {
      setBroadcastEnter(true);
      setBroadcastHint(true);
      const timer = window.setTimeout(() => setBroadcastEnter(false), 520);
      const hintTimer = window.setTimeout(() => setBroadcastHint(false), BROADCAST_HINT_MS);
      prevBroadcastRef.current = broadcastActive;
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(hintTimer);
      };
    }
    if (!broadcastActive) setBroadcastHint(false);
    prevBroadcastRef.current = broadcastActive;
    return undefined;
  }, [broadcastActive]);

  function clearDrag() {
    setDraggingPaneId(null);
    setDragOverPaneId(null);
    setDropZone(null);
    setProfileDragOver(null);
  }

  return (
    <div
      ref={shellRef}
      data-pane-id={pane.id}
      className={`group/pane relative flex min-h-0 w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden rounded-xl border transition-all duration-150 ${
        broadcastActive ? "broadcast-pane-sync" : ""
      } ${broadcastEnter ? "broadcast-pane-sync-enter" : ""} ${
        isDragOver || isProfileDragOver
          ? "ring-2 ring-chrome-ui-accent/35"
          : isDragging
            ? "opacity-45 scale-[0.99]"
            : focused && !profileAccentColor
              ? "border-chrome-border-focus ring-1 ring-chrome-hover-strong"
              : profileAccentColor
                ? "border-transparent"
                : "border-chrome-border"
      }`}
      style={{ background: bg, ...chromeStyle }}
      onMouseDown={onFocus}
      onDragOverCapture={(e) => {
        if (sidebarPaneDragActive && onProfilePaneDrop && hasProfilePaneDrag(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = shellRef.current?.getBoundingClientRect();
          if (rect) {
            setProfileDragOver({
              targetPaneId: pane.id,
              zone: hitPaneDropZone(e.clientX, e.clientY, rect),
            });
          }
          return;
        }
        if (hasProfilePaneDrag(e.dataTransfer) && onProfilePaneDrop) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = shellRef.current?.getBoundingClientRect();
          if (rect) {
            setProfileDragOver({
              targetPaneId: pane.id,
              zone: hitPaneDropZone(e.clientX, e.clientY, rect),
            });
          }
          return;
        }
        if (!draggingPaneId && isOsFileDrag(Array.from(e.dataTransfer.types))) {
          // Files from Explorer / Finder: drop pastes their paths into this pane.
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          return;
        }
        if (!canReorder || !draggingPaneId || draggingPaneId === pane.id) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const rect = shellRef.current?.getBoundingClientRect();
        if (rect) {
          setDropZone(hitPaneDropZone(e.clientX, e.clientY, rect));
        }
        setDragOverPaneId(pane.id);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          if (dragOverPaneId === pane.id) {
            setDragOverPaneId(null);
            setDropZone(null);
          }
          if (profileDragOver?.targetPaneId === pane.id) {
            setProfileDragOver(null);
          }
        }
      }}
      onDropCapture={(e) => {
        if (hasProfilePaneDrag(e.dataTransfer) && onProfilePaneDrop) {
          const payload = readProfilePaneDrag(e.dataTransfer);
          if (!payload || payload.paneId === pane.id) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = shellRef.current?.getBoundingClientRect();
          const zone = rect ? hitPaneDropZone(e.clientX, e.clientY, rect) : "right";
          onProfilePaneDrop(payload.paneId, pane.id, zone);
          clearDrag();
          return;
        }
        if (!draggingPaneId && isOsFileDrag(Array.from(e.dataTransfer.types))) {
          e.preventDefault();
          e.stopPropagation();
          const paths = droppedFilePaths(e.dataTransfer);
          if (paths.length === 0) return;
          onFocus();
          // term.paste: honours bracketed paste and reaches this pane only.
          pasteToTerminalSession(pane.sessionId, formatDroppedPaths(paths));
          return;
        }
        if (!canReorder || !draggingPaneId || draggingPaneId === pane.id) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = shellRef.current?.getBoundingClientRect();
        const zone = rect ? hitPaneDropZone(e.clientX, e.clientY, rect) : "swap";
        onMovePane?.(draggingPaneId, pane.id, zone);
        clearDrag();
      }}
    >
      <div
        className="relative z-20 flex h-9 shrink-0 items-center gap-1 border-b px-1.5"
        style={headerStyle}
      >
        {(canReorder || onPopOutPane) && (
          <span
            draggable
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.stopPropagation();
              setDraggingPaneId(pane.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={(e) => {
              // No drop target took it: released outside the page, Esc, or a dead spot.
              // Main decides whether the cursor really is outside every app window.
              const tearOff = e.dataTransfer.dropEffect === "none";
              clearDrag();
              if (tearOff) popOut("drag");
            }}
            className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded opacity-60 transition-opacity hover:bg-chrome-hover group-hover/pane:opacity-100 active:cursor-grabbing"
            title={
              canReorder
                ? onPopOutPane
                  ? `${t("pane.dragHint")}\n${t("pane.popout.dragHint")}`
                  : t("pane.dragHint")
                : t("pane.popout.dragHint")
            }
            aria-label={canReorder ? t("pane.dragHint") : t("pane.popout.dragHint")}

          >
            <DragHandle />
          </span>
        )}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-chrome-border-subtle bg-chrome-surface-raised">
          <ToolLogo tool={pane.tool} size={14} />
        </span>
        {paneAgentStatus && <PaneAgentStatusDot status={paneAgentStatus} />}
        {onRename ? (
          <EditablePaneTitle
            label={label}
            onRename={onRename}
            className={titleClass}
            inputClassName="text-[12px] font-medium"
          />
        ) : (
          <span className={titleClass}>
            {label}
          </span>
        )}
        {broadcastActive && (
          <span
            className="broadcast-sync-badge inline-flex shrink-0 items-center gap-1 rounded-full border border-chrome-ui-accent/30 bg-chrome-ui-accent/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-chrome-accent-text"
            title={t("chat.broadcastSyncTitle", { count: broadcastPaneCount })}
          >
            <span className="broadcast-sync-dot h-1 w-1 rounded-full bg-chrome-ui-accent" aria-hidden />
            {t("pane.broadcastSyncBadge")}
          </span>
        )}
        {maximized && onToggleMaximize && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMaximize();
            }}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-chrome-ui-accent/30 bg-chrome-ui-accent/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-chrome-accent-text transition-colors hover:bg-chrome-ui-accent/20"
            title={t("pane.maximizedHint", { keys: maximizeShortcutKeys ?? "" })}
            aria-label={t("pane.restoreLayout")}
          >
            <Maximize2 className="h-2.5 w-2.5" aria-hidden />
            {t("pane.maximizedBadge")}
          </button>
        )}
        <PaneGitBranch cwd={pane.cwd} />
        {onCwdClick ? (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCwdClick();
            }}
            className="relative z-10 min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left text-[11px] text-chrome-text-subtle transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text-secondary"
            title={pane.cwd ? `${pane.cwd}\n\n${t("pane.clickChangeCwd")}` : t("pane.clickPickCwd")}

          >
            {cwdShort || "~"}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] text-chrome-text-subtle" title={pane.cwd}>
            {cwdShort || "~"}
          </span>
        )}
        {/* Always shown on the focused pane; other panes reveal them on hover or keyboard focus. */}
        <div
          className={`flex items-center gap-0.5 transition-opacity ${
            focused
              ? "opacity-100"
              : "opacity-0 focus-within:opacity-100 group-hover/pane:opacity-100"
          }`}
        >
          <IconBtn title={t("pane.splitRight")} onClick={() => onSplit("horizontal")}>
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title={t("pane.splitDown")} onClick={() => onSplit("vertical")}>
            <SplitSquareVertical className="h-3.5 w-3.5" />
          </IconBtn>
          {onToggleMaximize && (
            <IconBtn
              title={withKeys(
                maximized ? t("pane.restoreLayout") : t("pane.maximize"),
                maximizeShortcutKeys,
              )}
              onClick={onToggleMaximize}
            >
              {maximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </IconBtn>
          )}
          {onMinimize && (
            <IconBtn title={t("pane.minimize")} onClick={onMinimize}>
              <Minus className="h-3.5 w-3.5" />
            </IconBtn>
          )}
          {onPopOutPane && (
            <IconBtn title={t("pane.popout.open")} onClick={() => popOut("menu")}>
              <ExternalLink className="h-3.5 w-3.5" />
            </IconBtn>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("pane.close")}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="flex cursor-pointer items-center justify-center rounded p-1 text-chrome-text-subtle transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("pane.close")}</TooltipContent>
        </Tooltip>
      </div>
      <div
        className={`warp-pane-body relative z-0 min-h-0 flex-1 overflow-hidden transition-opacity duration-200 ${
          dimmed ? "opacity-80" : "opacity-100"
        }`}
      >
        {sidebarPaneDragActive && onProfilePaneDrop && (
          <div
            className="absolute inset-0 z-30"
            aria-hidden
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              const rect = shellRef.current?.getBoundingClientRect();
              if (rect) {
                setProfileDragOver({
                  targetPaneId: pane.id,
                  zone: hitPaneDropZone(e.clientX, e.clientY, rect),
                });
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                if (profileDragOver?.targetPaneId === pane.id) {
                  setProfileDragOver(null);
                }
              }
            }}
            onDrop={(e) => {
              const payload = readProfilePaneDrag(e.dataTransfer);
              if (!payload || payload.paneId === pane.id) return;
              e.preventDefault();
              e.stopPropagation();
              const rect = shellRef.current?.getBoundingClientRect();
              const zone = rect ? hitPaneDropZone(e.clientX, e.clientY, rect) : "right";
              onProfilePaneDrop(payload.paneId, pane.id, zone);
              clearDrag();
            }}
          />
        )}
        {(isDragOver || isProfileDragOver) && activeDropZone && (
          <PaneDropOverlay
            zone={activeDropZone}
            targetLabel={isProfileDragOver ? label : undefined}
          />
        )}
        {children}
        {broadcastActive && (
          <div
            aria-hidden={!broadcastHint}
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex justify-center px-2 pb-2 transition-opacity duration-500 ${
              broadcastHint ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="inline-flex items-center gap-1 rounded-md border border-chrome-ui-accent/25 bg-chrome-surface-raised/92 px-2 py-0.5 text-[10px] text-chrome-accent-text shadow-sm backdrop-blur-sm">
              <span className="broadcast-sync-dot h-1 w-1 shrink-0 rounded-full bg-chrome-ui-accent" aria-hidden />
              {t("pane.broadcastInputHint", { count: broadcastPaneCount })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** OS paths of dropped files (Electron: webUtils via preload; `File.path` is gone). */
function droppedFilePaths(dataTransfer: DataTransfer): string[] {
  const out: string[] = [];
  for (const file of Array.from(dataTransfer.files)) {
    const legacy = (file as File & { path?: string }).path;
    const path = window.api.getPathForFile?.(file) || legacy || "";
    if (path) out.push(path);
  }
  return out;
}

function withKeys(label: string, keys: string | undefined): string {
  return keys ? `${label} (${keys})` : label;
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={title}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="flex cursor-pointer items-center justify-center rounded-md p-1 text-chrome-text-muted hover:bg-chrome-hover-strong hover:text-chrome-text"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

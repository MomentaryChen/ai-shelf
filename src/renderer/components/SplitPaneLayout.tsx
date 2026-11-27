import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  SplitSquareHorizontal,
  SplitSquareVertical,
  Minus,
  X,
  ExternalLink,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelLeftOpen,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { DragHandle } from "./ProfileSidebarUI";
import { PaneDropOverlay } from "./PaneDropOverlay";
import { paneDisplayLabel } from "../utils/pane-label";
import { ResizeDivider } from "./ResizeDivider";
import {
  SPLIT_DIVIDER_PX,
  clampSplitRatio,
  clampSplitRatioPx,
  minNodePx,
  splitFlexPair,
} from "../terminal/split-resize";
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
import { enteringPaneIds, PANE_ENTER_MS } from "../terminal/pane-enter";
import { useLocale } from "../i18n/LocaleProvider";
import {
  profilePaneChromeStyle,
  profilePaneHeaderStyle,
} from "../utils/profile-colors";
import { PaneAgentStatusDot } from "./PaneAgentStatusDot";
import type { PaneAgentStatus } from "../../shared/pane-agent-state.js";
import { PaneGitBranch } from "./TerminalGitStatus";

const DIVIDER_PX = SPLIT_DIVIDER_PX;
/** How long the in-pane broadcast hint stays up after broadcast turns on. */
const BROADCAST_HINT_MS = 4000;

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
  /**
   * Changing this (e.g. the active profile id) resets new-pane tracking, so the
   * panes of a freshly shown profile don't play the pane enter fade.
   */
  paneMotionScope?: string | null;
  focusedPaneId: string | null;
  bg: string;
  onFocusPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onMinimizePane?: (paneId: string) => void;
  /** Omitted = no split buttons (view windows). */
  onSplitPane?: (paneId: string, direction: SplitDirection) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  /**
   * Divider double-click / Enter: even out the row or column that split
   * `splitId` belongs to. Omitted = the gesture does nothing.
   */
  onEqualizeSplit?: (splitId: string) => void;
  onRenamePane?: (paneId: string, title: string) => void;
  onPaneCwdClick?: (paneId: string) => void;
  /** Click on a pane header's git branch (main window: worktree dialog). */
  onPaneBranchClick?: (paneId: string) => void;
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
  /** View windows: put the pane back into its origin window. */
  onDockPane?: (paneId: string) => void;
  /** Body opacity of unfocused panes while one pane has focus (default 0.8). */
  unfocusedDimOpacity?: number;
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
  unfocusedDimOpacity: number;
  setDraggingPaneId: (id: string | null) => void;
  setDragOverPaneId: (id: string | null) => void;
  setDropZone: (zone: PaneDropZone | null) => void;
  setProfileDragOver: (over: ProfileDragOver | null) => void;
  onMovePane?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  onProfilePaneDrop?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  onPopOutPane?: Props["onPopOutPane"];
  onDockPane?: Props["onDockPane"];
  /** Panes that just appeared (split, restore, dock) and play the enter fade. */
  enteringPaneIds: ReadonlySet<string>;
};

const NO_ENTERING_PANES: ReadonlySet<string> = new Set();

/**
 * Tracks which pane ids are new since the last layout and keeps them marked
 * for the length of the enter fade. A layout effect so the class is on before
 * the first paint of the new pane.
 */
function useEnteringPanes(
  paneIds: readonly string[],
  scope: string | null,
): ReadonlySet<string> {
  const [entering, setEntering] = useState(NO_ENTERING_PANES);
  const prevIdsRef = useRef<readonly string[] | null>(null);
  const timersRef = useRef<number[]>([]);
  const scopeRef = useRef(scope);
  const idsKey = paneIds.join("\n");

  useLayoutEffect(() => {
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      prevIdsRef.current = null;
    }
    const added = enteringPaneIds(prevIdsRef.current, paneIds);
    prevIdsRef.current = paneIds;
    if (added.length === 0) return;
    setEntering((prev) => new Set([...prev, ...added]));
    // Not cleared when the ids change again: a pane left marked would replay
    // the fade the next time the tree reshapes and remounts its frame.
    const timer = window.setTimeout(() => {
      setEntering((prev) => {
        const next = new Set(prev);
        for (const id of added) next.delete(id);
        return next.size === 0 ? NO_ENTERING_PANES : next;
      });
    }, PANE_ENTER_MS + 80);
    timersRef.current.push(timer);
    // idsKey stands in for paneIds (a new array every render).
  }, [idsKey, scope]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return entering;
}

export function SplitPaneLayout(props: Props) {
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<PaneDropZone | null>(null);
  const [profileDragOver, setProfileDragOver] = useState<ProfileDragOver | null>(null);
  const panes = collectPanes(props.node);
  const paneCount = panes.length;
  const entering = useEnteringPanes(
    panes.map((p) => p.id),
    props.paneMotionScope ?? null,
  );

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
    panes.some((p) => p.id === props.focusedPaneId);

  const drag: PaneDragState = {
    draggingPaneId,
    dragOverPaneId,
    dropZone,
    profileDragOver,
    canReorder,
    dimUnfocused,
    unfocusedDimOpacity: props.unfocusedDimOpacity ?? 0.8,
    setDraggingPaneId,
    setDragOverPaneId,
    setDropZone,
    setProfileDragOver,
    onMovePane: props.onMovePane,
    onProfilePaneDrop: props.onProfilePaneDrop,
    onPopOutPane: props.onPopOutPane,
    onDockPane: props.onDockPane,
    enteringPaneIds: entering,
  };

  return (
    <SplitPaneLayoutInner
      {...props}
      onToggleMaximizePane={paneCount > 1 ? props.onToggleMaximizePane : undefined}
      drag={drag}
    />
  );
}

type SplitPaneLayoutInnerProps = Props & { drag: PaneDragState };

function SplitPaneLayoutInner({ node, ...shared }: SplitPaneLayoutInnerProps) {
  const {
    focusedPaneId,
    bg,
    onFocusPane,
    onClosePane,
    onMinimizePane,
    onSplitPane,
    onRenamePane,
    onPaneCwdClick,
    onPaneBranchClick,
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
  } = shared;

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
          onSplit={onSplitPane ? (dir) => onSplitPane(node.pane.id, dir) : undefined}
          onRename={
            onRenamePane ? (title) => onRenamePane(node.pane.id, title) : undefined
          }
          onCwdClick={onPaneCwdClick ? () => onPaneCwdClick(node.pane.id) : undefined}
          onBranchClick={
            onPaneBranchClick ? () => onPaneBranchClick(node.pane.id) : undefined
          }
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

  return <SplitBranch {...shared} node={node} />;
}

type SplitNode = Extract<LayoutNode, { kind: "split" }>;

/**
 * One split: two sides and the divider between them. While the divider is
 * dragged the sides' `flex` is written straight to the DOM (no React state, so
 * nothing re-renders per pointermove); the final ratio is committed once on
 * release through `onResizeSplit`. Preview and render both build the style via
 * `splitFlexPair`, so the committed render matches what the DOM already shows.
 */
function SplitBranch({ node, ...shared }: SplitPaneLayoutInnerProps & { node: SplitNode }) {
  const { onResizeSplit, onEqualizeSplit, maximizedPaneId = null } = shared;
  const { t } = useLocale();
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);

  const horizontal = node.direction === "horizontal";
  const ratio = clampSplitRatio(node.ratio);
  const firstBasisPx = nestedDividerPx(node.first, node.direction);
  const secondBasisPx = nestedDividerPx(node.second, node.direction);
  const flex = splitFlexPair(ratio, firstBasisPx, secondBasisPx);
  /** Drag / key ratio → clamped so neither side drops below its pixel minimum. */
  const clampPx = (raw: number, containerPx: number) =>
    clampSplitRatioPx(raw, {
      containerPx,
      dividerPx: DIVIDER_PX,
      firstBasisPx,
      secondBasisPx,
      firstMinPx: minNodePx(node.first, node.direction),
      secondMinPx: minNodePx(node.second, node.direction),
    });
  // Maximized: same element tree (nothing unmounts), the other side and the
  // divider are display:none and the kept side takes the full split.
  const keep = maximizedSplitSide(node, maximizedPaneId);
  const sideStyle = (side: "first" | "second") =>
    keep === null
      ? { flex: flex[side] }
      : keep === side
        ? { flex: "1 1 0px" }
        : { display: "none" };

  /** Write both sides' flex for `nextRatio` (clamped) directly on the DOM. */
  const applyFlex = (nextRatio: number) => {
    const first = firstRef.current;
    const second = secondRef.current;
    // Maximized (e.g. toggled mid-drag): React owns the 1 1 0px / none styles.
    if (!first || !second || keep !== null) return;
    const pair = splitFlexPair(nextRatio, firstBasisPx, secondBasisPx);
    first.style.flex = pair.first;
    second.style.flex = pair.second;
  };

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-1 overflow-hidden ${
        horizontal ? "flex-row" : "flex-col"
      }`}
    >
      <div
        ref={firstRef}
        className="flex min-h-0 min-w-0 flex-col overflow-hidden self-stretch"
        style={sideStyle("first")}
      >
        <SplitPaneLayoutInner {...shared} node={node.first} />
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
          ratio={ratio}
          ariaLabel={t(horizontal ? "pane.divider.resizeColumns" : "pane.divider.resizeRows")}
          onEqualize={onEqualizeSplit ? () => onEqualizeSplit(node.id) : undefined}
          onResizePreview={(raw, containerPx) => applyFlex(clampPx(raw, containerPx))}
          onResizeCommit={(raw, containerPx) => {
            const next = clampPx(raw, containerPx);
            // Leave the DOM at the committed value; React's next render writes
            // the identical string. If the ratio is unchanged React skips the
            // write, which is fine because the DOM already holds that value.
            applyFlex(next);
            if (next !== ratio) onResizeSplit(node.id, next);
          }}
          // Back to what React last rendered (state never changed mid-drag).
          onResizeCancel={() => applyFlex(ratio)}
        />
      </div>

      <div
        ref={secondRef}
        className="flex min-h-0 min-w-0 flex-col overflow-hidden self-stretch"
        style={sideStyle("second")}
      >
        <SplitPaneLayoutInner {...shared} node={node.second} />
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
  onBranchClick,
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
  onSplit?: (dir: SplitDirection) => void;
  onRename?: (title: string) => void;
  onCwdClick?: () => void;
  onBranchClick?: () => void;
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
    onDockPane,
  } = drag;
  const entering = drag.enteringPaneIds.has(pane.id);
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
  const hasSecondaryActions = Boolean(
    onSplit || onToggleMaximize || onMinimize || onPopOutPane || onDockPane,
  );
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
      const timer = window.setTimeout(() => setBroadcastEnter(false), 520);
      prevBroadcastRef.current = broadcastActive;
      return () => window.clearTimeout(timer);
    }
    prevBroadcastRef.current = broadcastActive;
    return undefined;
  }, [broadcastActive]);

  // Also runs for a pane that mounts while broadcast is already on (a new split,
  // or switching to a broadcast profile), which the enter animation above skips.
  useEffect(() => {
    if (!broadcastActive) {
      setBroadcastHint(false);
      return undefined;
    }
    setBroadcastHint(true);
    const timer = window.setTimeout(() => setBroadcastHint(false), BROADCAST_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [broadcastActive]);

  /** Drop zone under the pointer, measured against this pane's shell. */
  function zoneAt(e: React.DragEvent): PaneDropZone | null {
    const rect = shellRef.current?.getBoundingClientRect();
    return rect ? hitPaneDropZone(e.clientX, e.clientY, rect) : null;
  }

  /** Highlight the zone a profile-sidebar pane would land in. */
  function trackProfileDragOver(e: React.DragEvent) {
    const zone = zoneAt(e);
    if (zone) setProfileDragOver({ targetPaneId: pane.id, zone });
  }

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
      } ${broadcastEnter ? "broadcast-pane-sync-enter" : ""} ${entering ? "ui-pane-enter" : ""} ${
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
        if (onProfilePaneDrop && hasProfilePaneDrag(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          trackProfileDragOver(e);
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
        const zone = zoneAt(e);
        if (zone) setDropZone(zone);
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
          if (!payload || payload.paneId === pane.id) {
            // Nothing to move, but the drop highlight must not stay on.
            setProfileDragOver(null);
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          onProfilePaneDrop(payload.paneId, pane.id, zoneAt(e) ?? "right");
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
        onMovePane?.(draggingPaneId, pane.id, zoneAt(e) ?? "swap");
        clearDrag();
      }}
    >
      {/*
        `@container/pane-header`: narrow panes collapse the secondary actions
        into a "⋯" menu (below 420px) and then drop the git branch / cwd
        (below 260px). The px values live in the classes below.
      */}
      <div
        className="@container/pane-header relative z-20 flex h-9 shrink-0 items-center gap-1 border-b px-1.5"
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
            <span className="@max-[260px]/pane-header:hidden">{t("pane.broadcastSyncBadge")}</span>
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
        <span className="contents @max-[260px]/pane-header:hidden">
          <PaneGitBranch cwd={pane.cwd} sessionId={pane.sessionId} onClick={onBranchClick} />
        </span>
        {onCwdClick ? (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCwdClick();
            }}
            className="relative z-10 min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left text-[11px] text-chrome-text-subtle transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text-secondary @max-[260px]/pane-header:hidden"
            title={pane.cwd ? `${pane.cwd}\n\n${t("pane.clickChangeCwd")}` : t("pane.clickPickCwd")}

          >
            {cwdShort || "~"}
          </button>
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-[11px] text-chrome-text-subtle @max-[260px]/pane-header:hidden"
            title={pane.cwd}
          >
            {cwdShort || "~"}
          </span>
        )}
        {/* Always shown on the focused pane; other panes reveal them on hover or keyboard focus. */}
        <div
          className={`ml-auto flex items-center gap-0.5 transition-opacity ${
            focused
              ? "opacity-100"
              : "opacity-0 focus-within:opacity-100 group-hover/pane:opacity-100 has-[[data-state=open]]:opacity-100"
          }`}
        >
          {hasSecondaryActions && (
            <div className="hidden @max-[420px]/pane-header:flex">
              <PaneActionsMenu
                label={t("pane.moreActions")}
                onBeforeSelect={onFocus}
                items={[
                  ...(onSplit
                    ? [
                        {
                          key: "split-right",
                          label: t("pane.splitRight"),
                          icon: <SplitSquareHorizontal />,
                          onSelect: () => onSplit("horizontal"),
                        },
                        {
                          key: "split-down",
                          label: t("pane.splitDown"),
                          icon: <SplitSquareVertical />,
                          onSelect: () => onSplit("vertical"),
                        },
                      ]
                    : []),
                  ...(onToggleMaximize
                    ? [
                        {
                          key: "maximize",
                          label: withKeys(
                            maximized ? t("pane.restoreLayout") : t("pane.maximize"),
                            maximizeShortcutKeys,
                          ),
                          icon: maximized ? <Minimize2 /> : <Maximize2 />,
                          onSelect: onToggleMaximize,
                          separatorBefore: Boolean(onSplit),
                        },
                      ]
                    : []),
                  ...(onMinimize
                    ? [
                        {
                          key: "minimize",
                          label: t("pane.minimize"),
                          icon: <Minus />,
                          onSelect: onMinimize,
                          separatorBefore: Boolean(onSplit) && !onToggleMaximize,
                        },
                      ]
                    : []),
                  ...(onPopOutPane
                    ? [
                        {
                          key: "popout",
                          label: t("pane.popout.open"),
                          icon: <ExternalLink />,
                          onSelect: () => popOut("menu"),
                        },
                      ]
                    : []),
                  ...(onDockPane
                    ? [
                        {
                          key: "dock",
                          label: t("pane.popout.dock"),
                          icon: <PanelLeftOpen />,
                          onSelect: () => onDockPane(pane.id),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          )}
          <div className="flex items-center gap-0.5 @max-[420px]/pane-header:hidden">
            {onSplit && (
              <>
                <IconBtn title={t("pane.splitRight")} onClick={() => onSplit("horizontal")}>
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn title={t("pane.splitDown")} onClick={() => onSplit("vertical")}>
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            )}
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
            {onDockPane && (
              <IconBtn title={t("pane.popout.dock")} onClick={() => onDockPane(pane.id)}>
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </IconBtn>
            )}
          </div>
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
        className="warp-pane-body relative z-0 min-h-0 flex-1 overflow-hidden transition-opacity duration-200"
        style={{ opacity: dimmed ? drag.unfocusedDimOpacity : 1 }}
      >
        {/*
          Plain drag target over xterm while a sidebar pane is dragged, so the
          terminal's canvas / helper textarea never becomes the drag target.
          Dragover and drop are handled by the shell's capture handlers.
        */}
        {sidebarPaneDragActive && onProfilePaneDrop && (
          <div
            className="absolute inset-0 z-30"
            aria-hidden
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                if (profileDragOver?.targetPaneId === pane.id) {
                  setProfileDragOver(null);
                }
              }
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

type PaneMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  separatorBefore?: boolean;
};

/**
 * "⋯" menu holding the header's secondary actions on narrow panes. The content
 * is portaled, but React events still bubble to the pane shell, so mouse /
 * click events are stopped like `IconBtn` does (no pane focus / drag start).
 */
function PaneActionsMenu({
  label,
  items,
  onBeforeSelect,
}: {
  label: string;
  items: PaneMenuItem[];
  /**
   * Focuses the pane before an item runs: the trigger's mousedown is stopped
   * (so opening the menu does not let the terminal grab focus and dismiss it),
   * and maximize only applies to the focused pane.
   */
  onBeforeSelect?: () => void;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <DropdownMenu>
      {/* Dropdown trigger outside: its data-state (open/closed) must win over the tooltip's. */}
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              onMouseDown={stop}
              onClick={stop}
              className="flex cursor-pointer items-center justify-center rounded-md p-1 text-chrome-text-muted hover:bg-chrome-hover-strong hover:text-chrome-text data-[state=open]:bg-chrome-hover-strong data-[state=open]:text-chrome-text"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-[180px]"
        onMouseDown={stop}
        onClick={stop}
        onPointerDown={stop}
      >
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="text-[12px]"
              onSelect={() => {
                onBeforeSelect?.();
                item.onSelect();
              }}
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center [&_svg]:size-3.5" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

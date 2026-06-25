import { useEffect, useRef, useState, type ReactNode } from "react";
import { SplitSquareHorizontal, SplitSquareVertical, Minus, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { DragHandle } from "./ProfileSidebarUI";
import { PaneDropOverlay } from "./PaneDropOverlay";
import { paneDisplayLabel } from "../utils/pane-label";
import { ResizeDivider } from "./ResizeDivider";
import { hitPaneDropZone, type PaneDropZone } from "../terminal/pane-drop-zone";
import { hasProfilePaneDrag, readProfilePaneDrag } from "../terminal/profile-pane-display";
import { collectPanes, type LayoutNode, type PaneInfo, type SplitDirection } from "../terminal/split-tree";
import { formatPaneCwdShort } from "../utils/pane-cwd";
import { useLocale } from "../i18n/LocaleProvider";
import {
  profilePaneChromeStyle,
  profilePaneHeaderDotStyle,
  profilePaneHeaderStyle,
} from "../utils/profile-colors";

const DIVIDER_PX = 10;

function clampRatio(ratio: number): number {
  return Math.min(0.9, Math.max(0.1, ratio));
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
}

type ProfileDragOver = { targetPaneId: string; zone: PaneDropZone };

type PaneDragState = {
  draggingPaneId: string | null;
  dragOverPaneId: string | null;
  dropZone: PaneDropZone | null;
  profileDragOver: ProfileDragOver | null;
  canReorder: boolean;
  setDraggingPaneId: (id: string | null) => void;
  setDragOverPaneId: (id: string | null) => void;
  setDropZone: (zone: PaneDropZone | null) => void;
  setProfileDragOver: (over: ProfileDragOver | null) => void;
  onMovePane?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  onProfilePaneDrop?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
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

  const drag: PaneDragState = {
    draggingPaneId,
    dragOverPaneId,
    dropZone,
    profileDragOver,
    canReorder,
    setDraggingPaneId,
    setDragOverPaneId,
    setDropZone,
    setProfileDragOver,
    onMovePane: props.onMovePane,
    onProfilePaneDrop: props.onProfilePaneDrop,
  };

  return <SplitPaneLayoutInner {...props} drag={drag} />;
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
        >
          {renderTerminal(node.pane, focused)}
        </WarpPaneShell>
      </div>
    );
  }

  const horizontal = node.direction === "horizontal";
  const ratio = clampRatio(node.ratio);
  const rest = 1 - ratio;

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-1 overflow-hidden ${
        horizontal ? "flex-row" : "flex-col"
      }`}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden self-stretch"
        style={{ flex: `${ratio} 1 0px` }}
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
          drag={drag}
        />
      </div>

      <div
        className={`shrink-0 ${horizontal ? "w-2.5 self-stretch" : "h-2.5 w-full"}`}
        style={horizontal ? { width: DIVIDER_PX } : { height: DIVIDER_PX }}
      >
        <ResizeDivider
          mode="ratio"
          orientation={node.direction}
          onResize={(r) => onResizeSplit(node.id, r)}
        />
      </div>

      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden self-stretch"
        style={{ flex: `${rest} 1 0px` }}
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
  drag,
  onFocus,
  onClose,
  onMinimize,
  onSplit,
  onRename,
  onCwdClick,
  sidebarPaneDragActive = false,
  children,
}: {
  pane: PaneInfo;
  focused: boolean;
  bg: string;
  profileAccentColor?: string | null;
  broadcastActive?: boolean;
  broadcastPaneCount?: number;
  sidebarPaneDragActive?: boolean;
  drag: PaneDragState;
  onFocus: () => void;
  onClose: () => void;
  onMinimize?: () => void;
  onSplit: (dir: SplitDirection) => void;
  onRename?: (title: string) => void;
  onCwdClick?: () => void;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const cwdShort = formatPaneCwdShort(pane.cwd);
  const chromeStyle = profilePaneChromeStyle(profileAccentColor, focused);
  const headerStyle = profilePaneHeaderStyle(profileAccentColor, focused);
  const dotStyle = profilePaneHeaderDotStyle(profileAccentColor);
  const shellRef = useRef<HTMLDivElement>(null);
  const {
    draggingPaneId,
    dragOverPaneId,
    dropZone,
    profileDragOver,
    canReorder,
    setDraggingPaneId,
    setDragOverPaneId,
    setDropZone,
    setProfileDragOver,
    onMovePane,
    onProfilePaneDrop,
  } = drag;
  const isDragOver = dragOverPaneId === pane.id && draggingPaneId !== pane.id;
  const isProfileDragOver = profileDragOver?.targetPaneId === pane.id;
  const activeDropZone = isProfileDragOver ? profileDragOver.zone : dropZone;
  const isDragging = draggingPaneId === pane.id;

  function clearDrag() {
    setDraggingPaneId(null);
    setDragOverPaneId(null);
    setDropZone(null);
    setProfileDragOver(null);
  }

  return (
    <div
      ref={shellRef}
      className={`group/pane relative flex min-h-0 w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden rounded-xl border transition-all duration-150 ${
        broadcastActive ? "broadcast-pane-sync" : ""
      } ${
        isDragOver || isProfileDragOver
          ? "ring-2 ring-accent/35"
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
        {canReorder && (
          <span
            draggable
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.stopPropagation();
              setDraggingPaneId(pane.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={clearDrag}
            className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded opacity-60 transition-opacity hover:bg-chrome-hover group-hover/pane:opacity-100 active:cursor-grabbing"
            title={t("pane.dragHint")}
            aria-label={t("pane.dragHint")}

          >
            <DragHandle />
          </span>
        )}
        {profileAccentColor && (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${focused ? "" : "opacity-50"}`}
            style={dotStyle}
            aria-hidden
          />
        )}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-chrome-border-subtle bg-chrome-surface-raised">
          <ToolLogo tool={pane.tool} size={14} />
        </span>
        {onRename ? (
          <EditablePaneTitle
            label={paneDisplayLabel(pane)}
            onRename={onRename}
            className="min-w-0 max-w-[45%] shrink truncate text-[12px] font-medium text-chrome-text"
            inputClassName="text-[12px] font-medium"
          />
        ) : (
          <span className="min-w-0 max-w-[45%] shrink truncate text-[12px] font-medium text-chrome-text">
            {paneDisplayLabel(pane)}
          </span>
        )}
        {broadcastActive && (
          <span
            className="broadcast-sync-badge inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-chrome-accent-text"
            title={t("chat.broadcastSyncTitle", { count: broadcastPaneCount })}
          >
            <span className="broadcast-sync-dot h-1 w-1 rounded-full bg-accent" aria-hidden />
            {t("pane.broadcastSyncBadge")}
          </span>
        )}
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
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/pane:opacity-100">
          <IconBtn title={t("pane.splitRight")} onClick={() => onSplit("horizontal")}>
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title={t("pane.splitDown")} onClick={() => onSplit("vertical")}>
            <SplitSquareVertical className="h-3.5 w-3.5" />
          </IconBtn>
          {onMinimize && (
            <IconBtn title={t("pane.minimize")} onClick={onMinimize}>
              <Minus className="h-3.5 w-3.5" />
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
      <div className="warp-pane-body relative z-0 min-h-0 flex-1 overflow-hidden">
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
            targetLabel={isProfileDragOver ? paneDisplayLabel(pane) : undefined}
          />
        )}
        {children}
        {broadcastActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex justify-center bg-gradient-to-t from-[color-mix(in_srgb,var(--color-bg-primary)_90%,transparent)] to-transparent px-2 pb-1.5 pt-5">
            <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-chrome-surface-raised/92 px-2 py-0.5 text-[10px] text-chrome-accent-text shadow-sm backdrop-blur-sm">
              <span className="broadcast-sync-dot h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
              {t("pane.broadcastInputHint", { count: broadcastPaneCount })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
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

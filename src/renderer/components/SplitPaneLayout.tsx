import { useRef, useState, type ReactNode } from "react";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { DragHandle } from "./ProfileSidebarUI";
import { PaneDropOverlay } from "./PaneDropOverlay";
import { paneDisplayLabel } from "../utils/pane-label";
import { ResizeDivider } from "./ResizeDivider";
import { hitPaneDropZone, type PaneDropZone } from "../terminal/pane-drop-zone";
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
  onSplitPane: (paneId: string, direction: SplitDirection) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onRenamePane?: (paneId: string, title: string) => void;
  onPaneCwdClick?: (paneId: string) => void;
  onMovePane?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
  renderTerminal: (pane: PaneInfo, focused: boolean) => ReactNode;
  profileAccentColor?: string | null;
}

type PaneDragState = {
  draggingPaneId: string | null;
  dragOverPaneId: string | null;
  dropZone: PaneDropZone | null;
  canReorder: boolean;
  setDraggingPaneId: (id: string | null) => void;
  setDragOverPaneId: (id: string | null) => void;
  setDropZone: (zone: PaneDropZone | null) => void;
  onMovePane?: (dragPaneId: string, targetPaneId: string, zone: PaneDropZone) => void;
};

export function SplitPaneLayout(props: Props) {
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<PaneDropZone | null>(null);
  const paneCount = collectPanes(props.node).length;
  const canReorder = paneCount > 1 && Boolean(props.onMovePane);

  const drag: PaneDragState = {
    draggingPaneId,
    dragOverPaneId,
    dropZone,
    canReorder,
    setDraggingPaneId,
    setDragOverPaneId,
    setDropZone,
    onMovePane: props.onMovePane,
  };

  return <SplitPaneLayoutInner {...props} drag={drag} />;
}

function SplitPaneLayoutInner({
  node,
  focusedPaneId,
  bg,
  onFocusPane,
  onClosePane,
  onSplitPane,
  onResizeSplit,
  onRenamePane,
  onPaneCwdClick,
  renderTerminal,
  profileAccentColor = null,
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
          drag={drag}
          onFocus={() => onFocusPane(node.pane.id)}
          onClose={() => onClosePane(node.pane.id)}
          onSplit={(dir) => onSplitPane(node.pane.id, dir)}
          onRename={
            onRenamePane ? (title) => onRenamePane(node.pane.id, title) : undefined
          }
          onCwdClick={onPaneCwdClick ? () => onPaneCwdClick(node.pane.id) : undefined}
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
          onSplitPane={onSplitPane}
          onResizeSplit={onResizeSplit}
          onRenamePane={onRenamePane}
          onPaneCwdClick={onPaneCwdClick}
          renderTerminal={renderTerminal}
          profileAccentColor={profileAccentColor}
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
          onSplitPane={onSplitPane}
          onResizeSplit={onResizeSplit}
          onRenamePane={onRenamePane}
          onPaneCwdClick={onPaneCwdClick}
          renderTerminal={renderTerminal}
          profileAccentColor={profileAccentColor}
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
  drag,
  onFocus,
  onClose,
  onSplit,
  onRename,
  onCwdClick,
  children,
}: {
  pane: PaneInfo;
  focused: boolean;
  bg: string;
  profileAccentColor?: string | null;
  drag: PaneDragState;
  onFocus: () => void;
  onClose: () => void;
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
    canReorder,
    setDraggingPaneId,
    setDragOverPaneId,
    setDropZone,
    onMovePane,
  } = drag;
  const isDragOver = dragOverPaneId === pane.id && draggingPaneId !== pane.id;
  const isDragging = draggingPaneId === pane.id;

  function clearDrag() {
    setDraggingPaneId(null);
    setDragOverPaneId(null);
    setDropZone(null);
  }

  return (
    <div
      ref={shellRef}
      className={`group/pane relative flex min-h-0 w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden rounded-xl border transition-all duration-150 ${
        isDragOver
          ? "ring-2 ring-accent/35"
          : isDragging
            ? "opacity-45 scale-[0.99]"
            : focused && !profileAccentColor
              ? "border-chrome-border-focus ring-1 ring-chrome-hover-strong"
              : "border-chrome-border"
      }`}
      style={{ background: bg, ...chromeStyle }}
      onMouseDown={onFocus}
      onDragOver={(e) => {
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
        }
      }}
      onDrop={(e) => {
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
        className="relative z-10 flex h-9 shrink-0 items-center gap-1 border-b px-1.5"
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
            className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded hover:bg-chrome-hover active:cursor-grabbing"
            title={t("pane.dragHint")}
            aria-label={t("pane.dragHint")}

          >
            <DragHandle />
          </span>
        )}
        {focused && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={dotStyle} aria-hidden />
        )}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03]">
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
        {onCwdClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCwdClick();
            }}
            className="min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left text-[11px] text-chrome-text-subtle transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text-secondary"
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
            ⫽
          </IconBtn>
          <IconBtn title={t("pane.splitDown")} onClick={() => onSplit("vertical")}>
            ⫼
          </IconBtn>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="cursor-pointer rounded px-1 text-[11px] text-chrome-text-subtle transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
          title={t("pane.close")}

        >
          ✕
        </button>
      </div>
      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
        {isDragOver && dropZone && <PaneDropOverlay zone={dropZone} />}
        {children}
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
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer rounded-md px-1.5 py-0.5 text-[10px] text-chrome-text-muted hover:bg-chrome-hover-strong hover:text-chrome-text"
    >
      {children}
    </button>
  );
}

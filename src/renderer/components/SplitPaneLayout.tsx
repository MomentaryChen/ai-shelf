import type { ReactNode } from "react";
import { ToolLogo } from "./ToolLogo";
import { toolLabel } from "../utils";
import { ResizeDivider } from "./ResizeDivider";
import type { LayoutNode, PaneInfo, SplitDirection } from "../terminal/split-tree";

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
  renderTerminal: (pane: PaneInfo, focused: boolean) => ReactNode;
}

export function SplitPaneLayout({
  node,
  focusedPaneId,
  bg,
  onFocusPane,
  onClosePane,
  onSplitPane,
  onResizeSplit,
  renderTerminal,
}: Props) {
  if (node.kind === "pane") {
    const focused = focusedPaneId === node.pane.id;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch">
        <WarpPaneShell
          key={node.pane.sessionId}
          pane={node.pane}
          focused={focused}
          bg={bg}
          onFocus={() => onFocusPane(node.pane.id)}
          onClose={() => onClosePane(node.pane.id)}
          onSplit={(dir) => onSplitPane(node.pane.id, dir)}
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
        <SplitPaneLayout
          node={node.first}
          focusedPaneId={focusedPaneId}
          bg={bg}
          onFocusPane={onFocusPane}
          onClosePane={onClosePane}
          onSplitPane={onSplitPane}
          onResizeSplit={onResizeSplit}
          renderTerminal={renderTerminal}
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
        <SplitPaneLayout
          node={node.second}
          focusedPaneId={focusedPaneId}
          bg={bg}
          onFocusPane={onFocusPane}
          onClosePane={onClosePane}
          onSplitPane={onSplitPane}
          onResizeSplit={onResizeSplit}
          renderTerminal={renderTerminal}
        />
      </div>
    </div>
  );
}

function WarpPaneShell({
  pane,
  focused,
  bg,
  onFocus,
  onClose,
  onSplit,
  children,
}: {
  pane: PaneInfo;
  focused: boolean;
  bg: string;
  onFocus: () => void;
  onClose: () => void;
  onSplit: (dir: SplitDirection) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`group/pane flex min-h-0 w-full min-w-0 flex-1 flex-col self-stretch overflow-hidden rounded-lg border transition-colors ${
        focused ? "border-[#3d3d3d] ring-1 ring-white/10" : "border-[#1f1f1f]"
      }`}
      style={{ background: bg }}
      onMouseDown={onFocus}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#1f1f1f] bg-black/40 px-2.5">
        <ToolLogo tool={pane.tool} size={14} />
        <span className="truncate text-[12px] font-medium text-[#e8e8e8]">{toolLabel(pane.tool)}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[#6b6b6b]" title={pane.cwd}>
          {pane.cwd ? pane.cwd.replace(/^.*[/\\]/, "") || pane.cwd : "~"}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/pane:opacity-100">
          <IconBtn title="Split right" onClick={() => onSplit("horizontal")}>
            ⫽
          </IconBtn>
          <IconBtn title="Split down" onClick={() => onSplit("vertical")}>
            ⫼
          </IconBtn>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="cursor-pointer rounded px-1 text-[11px] text-[#6b6b6b] transition-colors hover:bg-white/10 hover:text-[#f0f0f0]"
          title="Close pane"
        >
          ✕
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
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
      className="cursor-pointer rounded px-1 py-0.5 text-[10px] text-[#8a8a8a] hover:bg-white/10 hover:text-[#e0e0e0]"
    >
      {children}
    </button>
  );
}

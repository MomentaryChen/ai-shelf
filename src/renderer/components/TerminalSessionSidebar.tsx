import { useMemo, useState, type ReactNode } from "react";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { paneDisplayLabel, paneMatchesQuery } from "../utils/pane-label";
import type { PaneInfo } from "../terminal/split-tree";

interface Props {
  panes: PaneInfo[];
  focusedPaneId: string | null;
  onSelectPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onRenamePane?: (paneId: string, title: string) => void;
  onNewSession: () => void;
  workspaceSlot?: ReactNode;
}

export function TerminalSessionSidebar({
  panes,
  focusedPaneId,
  onSelectPane,
  onClosePane,
  onRenamePane,
  onNewSession,
  workspaceSlot,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return panes;
    return panes.filter((p) => paneMatchesQuery(p, q));
  }, [panes, query]);

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#1f1f1f] bg-[#0a0a0a]">
      <div className="border-b border-[#1f1f1f] p-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tabs…"
          className="w-full rounded-md border border-[#252525] bg-[#111111] px-2.5 py-1.5 text-[12px] text-[#e8e8e8] placeholder:text-[#5a5a5a] focus:border-[#404040] focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] text-[#5a5a5a]">
            {panes.length === 0 ? "No sessions" : "No matching tabs"}
          </p>
        )}
        {filtered.map((pane) => {
          const active = focusedPaneId === pane.id;
          return (
            <button
              key={pane.id}
              type="button"
              onClick={() => onSelectPane(pane.id)}
              className={`mb-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                active ? "bg-[#1f1f1f] text-[#f0f0f0]" : "text-[#a0a0a0] hover:bg-[#151515]"
              }`}
            >
              <ToolLogo tool={pane.tool} size={14} />
              {onRenamePane ? (
                <EditablePaneTitle
                  label={paneDisplayLabel(pane)}
                  onRename={(title) => onRenamePane(pane.id, title)}
                  className="text-[12px]"
                  inputClassName="text-[12px]"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-[12px]">{paneDisplayLabel(pane)}</span>
              )}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePane(pane.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onClosePane(pane.id);
                  }
                }}
                className="shrink-0 rounded px-0.5 text-[10px] opacity-40 hover:opacity-100"
              >
                ✕
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onNewSession}
          className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12px] text-[#6b6b6b] transition-colors hover:bg-[#151515] hover:text-[#c0c0c0]"
        >
          <span className="flex h-[14px] w-[14px] items-center justify-center text-[13px]">+</span>
          New session
        </button>
      </div>

      {workspaceSlot && (
        <div className="max-h-[45%] shrink-0 overflow-hidden border-t border-[#1f1f1f]">{workspaceSlot}</div>
      )}

      <div className="border-t border-[#1f1f1f] p-2">
        <button
          type="button"
          onClick={() => void window.api.openSettingsWindow()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12px] text-[#8a8a8a] transition-colors hover:bg-[#151515] hover:text-[#e0e0e0]"
        >
          <span>⚙</span>
          Settings
        </button>
      </div>
    </aside>
  );
}

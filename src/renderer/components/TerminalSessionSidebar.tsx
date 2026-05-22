import { useMemo, useState, type ReactNode } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { ToolLogo } from "./ToolLogo";
import { EditablePaneTitle } from "./EditablePaneTitle";
import { DragHandle } from "./ProfileSidebarUI";
import { paneDisplayLabel, paneMatchesQuery } from "../utils/pane-label";
import type { PaneInfo } from "../terminal/split-tree";

interface Props {
  panes: PaneInfo[];
  focusedPaneId: string | null;
  onSelectPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onRenamePane?: (paneId: string, title: string) => void;
  onReorderPanes?: (dragPaneId: string, dropPaneId: string) => void;
  onNewSession: () => void;
  workspaceSlot?: ReactNode;
}

export function TerminalSessionSidebar({
  panes,
  focusedPaneId,
  onSelectPane,
  onClosePane,
  onRenamePane,
  onReorderPanes,
  onNewSession,
  workspaceSlot,
}: Props) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [draggingPaneId, setDraggingPaneId] = useState<string | null>(null);
  const [dragOverPaneId, setDragOverPaneId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return panes;
    return panes.filter((p) => paneMatchesQuery(p, q));
  }, [panes, query]);

  const canReorderPanes = !query.trim() && panes.length > 1 && Boolean(onReorderPanes);

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-chrome-border bg-chrome-bg">
      <div className="border-b border-chrome-border p-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("sidebar.searchTabs")}
          className="w-full rounded-md border border-chrome-border-subtle bg-chrome-surface px-2.5 py-1.5 text-[12px] text-chrome-text placeholder:text-chrome-text-dim focus:border-chrome-border-hover focus:outline-none"

        />
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] text-chrome-text-dim">
            {panes.length === 0 ? t("sidebar.noSessions") : t("sidebar.noMatchingTabs")}

          </p>
        )}
        {filtered.map((pane) => {
          const active = focusedPaneId === pane.id;
          return (
            <div
              key={pane.id}
              className={`mb-0.5 flex min-h-[32px] items-center gap-0.5 rounded-lg transition-all duration-150 ${
                dragOverPaneId === pane.id && draggingPaneId !== pane.id
                  ? "ring-2 ring-accent/35"
                  : draggingPaneId === pane.id
                    ? "opacity-45 scale-[0.99]"
                    : ""
              }`}
              onDragOver={(e) => {
                if (!canReorderPanes || !draggingPaneId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverPaneId(pane.id);
              }}
              onDragLeave={() => {
                if (dragOverPaneId === pane.id) setDragOverPaneId(null);
              }}
              onDrop={(e) => {
                if (!canReorderPanes || !draggingPaneId) return;
                e.preventDefault();
                onReorderPanes!(draggingPaneId, pane.id);
                setDraggingPaneId(null);
                setDragOverPaneId(null);
              }}
            >
              {canReorderPanes && (
                <span
                  draggable
                  onDragStart={(e) => {
                    setDraggingPaneId(pane.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDraggingPaneId(null);
                    setDragOverPaneId(null);
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
              onClick={() => onSelectPane(pane.id)}
              className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                active ? "bg-chrome-surface-hover-strong text-chrome-text" : "text-chrome-text-secondary hover:bg-chrome-surface-menu"
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
            </div>
          );
        })}

        <button
          type="button"
          onClick={onNewSession}
          className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12px] text-chrome-text-subtle transition-colors hover:bg-chrome-surface-menu hover:text-chrome-text-secondary"
        >
          <span className="flex h-[14px] w-[14px] items-center justify-center text-[13px]">+</span>
          {t("sidebar.newSession")}
        </button>
      </div>

      {workspaceSlot && (
        <div className="max-h-[45%] shrink-0 overflow-hidden border-t border-chrome-border">{workspaceSlot}</div>
      )}

      <div className="border-t border-chrome-border p-2">
        <button
          type="button"
          onClick={() => void window.api.openSettingsWindow()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[12px] text-chrome-text-muted transition-colors hover:bg-chrome-surface-menu hover:text-chrome-text"
        >
          <span>⚙</span>
          {t("sidebar.settings")}
        </button>
      </div>
    </aside>
  );
}

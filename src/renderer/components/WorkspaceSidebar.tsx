import { useCallback, useEffect, useState } from "react";
import type { GroupInfo, SessionInfo, WorkspaceInfo, WorkspaceTree } from "../types";
import { getGroupPaneCount, groupKey } from "../terminal/group-layout-storage";

export interface WorkspaceSelection {
  workspace: WorkspaceInfo;
  group: GroupInfo;
  session: SessionInfo;
}

export interface GroupSelection {
  workspace: WorkspaceInfo;
  group: GroupInfo;
}

interface Props {
  onSelect: (sel: WorkspaceSelection | null) => void;
  onActivateGroup: (sel: GroupSelection) => void;
  onLaunchTool: (tool: string, cwd: string) => void;
  activeGroupKey?: string | null;
  embedded?: boolean;
}

export function WorkspaceSidebar({
  onSelect,
  onActivateGroup,
  onLaunchTool,
  activeGroupKey = null,
  embedded = false,
}: Props) {
  const [tree, setTree] = useState<WorkspaceTree | null>(null);
  const [expandedWs, setExpandedWs] = useState<Set<string>>(new Set());
  const [expandedGrp, setExpandedGrp] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<WorkspaceSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    setErr("");
    try {
      const t = await window.api.wsGetTree();
      setTree(t);
    } catch {
      setTree({ workspaces: [], groups: {}, sessions: {}, groupLayouts: {}, lastActiveGroupKey: null });
      setErr("Failed to load workspaces (database unavailable — try restarting after pnpm install)");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleWs(id: string) {
    setExpandedWs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGrp(key: string) {
    setExpandedGrp((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pick(sel: WorkspaceSelection) {
    setSelected(sel);
    onSelect(sel);
  }

  function openGroup(ws: WorkspaceInfo, grp: GroupInfo) {
    setExpandedWs((p) => new Set(p).add(ws.id));
    setExpandedGrp((p) => new Set(p).add(`${ws.id}:${grp.id}`));
    onActivateGroup({ workspace: ws, group: grp });
  }

  async function createWorkspace() {
    const name = prompt("Workspace name:");
    if (!name?.trim()) return;
    const root = prompt("Root path (optional, for default cwd):");
    setBusy(true);
    setErr("");
    const r = await window.api.wsWorkspaceCreate(name.trim(), root?.trim() || undefined);
    setBusy(false);
    if (!r.success) setErr(r.error ?? "Failed");
    else void refresh();
  }

  async function createGroup(ws: WorkspaceInfo) {
    const name = prompt(`Group name in ${ws.name}:`);
    if (!name?.trim()) return;
    setBusy(true);
    const r = await window.api.wsGroupCreate(ws.name, name.trim());
    setBusy(false);
    if (!r.success) setErr(r.error ?? "Failed");
    else {
      setExpandedWs((p) => new Set(p).add(ws.id));
      void refresh();
    }
  }

  async function createSession(ws: WorkspaceInfo, grp: GroupInfo) {
    const name = prompt(`Session name in ${ws.name}/${grp.name}:`);
    if (!name?.trim()) return;
    setBusy(true);
    const r = await window.api.wsSessionCreate(ws.name, grp.name, name.trim(), {
      cwd: ws.root_path ?? undefined,
    });
    setBusy(false);
    if (!r.success) setErr(r.error ?? "Failed");
    else {
      setExpandedWs((p) => new Set(p).add(ws.id));
      setExpandedGrp((p) => new Set(p).add(`${ws.id}:${grp.id}`));
      void refresh();
    }
  }

  const shellClass = embedded
    ? "flex h-full w-full min-h-0 flex-col bg-transparent text-[12px] text-[#8a8a8a]"
    : "flex w-56 shrink-0 flex-col border-r border-border bg-bg-secondary";

  if (!tree) {
    return (
      <aside className={`${shellClass} p-3`}>
        {err ? <p className="text-[11px] text-fail">{err}</p> : "Loading workspaces…"}
      </aside>
    );
  }

  return (
    <aside className={shellClass}>
      <div
        className={`flex items-center justify-between px-3 py-2 ${embedded ? "border-b border-[#1f1f1f]" : "border-b border-border"}`}
      >
        <span
          className={`text-[11px] font-semibold uppercase tracking-wider ${embedded ? "text-[#6b6b6b]" : "text-text-secondary"}`}
        >
          Workspaces
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createWorkspace()}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[14px] hover:text-accent"
          title="New workspace"
        >
          +
        </button>
      </div>

      <p className={`px-3 py-1 text-[10px] ${embedded ? "text-[#5a5a5a]" : "text-text-tertiary"}`}>
        點選群組還原上次最多 4 個視窗與預設目錄
      </p>

      {err && <p className="px-3 py-1 text-[11px] text-fail">{err}</p>}

      <div className="flex-1 overflow-y-auto px-1 py-2">
        {tree.workspaces.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px] text-text-tertiary">No workspaces yet</p>
        )}
        {tree.workspaces.map((ws) => {
          const groups = tree.groups[ws.id] ?? [];
          const wsOpen = expandedWs.has(ws.id);
          return (
            <div key={ws.id} className="mb-1">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toggleWs(ws.id)}
                  className="cursor-pointer rounded px-1 py-1 text-[10px] hover:text-text-primary"
                >
                  {wsOpen ? "▼" : "▶"}
                </button>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{ws.name}</span>
                {ws.root_path && (
                  <span
                    className="max-w-[72px] truncate text-[9px] text-[#5a5a5a]"
                    title={ws.root_path}
                  >
                    {ws.root_path.replace(/^.*[/\\]/, "")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void createGroup(ws)}
                  className="cursor-pointer rounded px-1 text-[11px] hover:text-accent"
                  title="New group"
                >
                  +
                </button>
              </div>
              {wsOpen &&
                groups.map((grp) => {
                  const grpKey = `${ws.id}:${grp.id}`;
                  const grpOpen = expandedGrp.has(grpKey);
                  const gKey = groupKey(ws.id, grp.id);
                  const savedCount = getGroupPaneCount(tree.groupLayouts, ws.id, grp.id);
                  const isActiveGroup = activeGroupKey === gKey;
                  const sessions = (tree.sessions[ws.id] ?? []).filter((s) => s.group_id === grp.id);
                  return (
                    <div key={grp.id} className="ml-3">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleGrp(grpKey)}
                          className="cursor-pointer rounded px-1 py-0.5 text-[10px]"
                        >
                          {grpOpen ? "▼" : "▶"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openGroup(ws, grp)}
                          className={`min-w-0 flex-1 cursor-pointer truncate rounded px-1 py-0.5 text-left text-[11px] transition-colors ${
                            isActiveGroup
                              ? "bg-[#2a3a55] font-medium text-[#8ab4ff]"
                              : "text-[#b0b0b0] hover:bg-[#1a1a1a]"
                          }`}
                          title="還原此群組的上次視窗配置"
                        >
                          {grp.name}
                          {savedCount > 0 && (
                            <span className="ml-1 text-[9px] opacity-70">({savedCount})</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void createSession(ws, grp)}
                          className="cursor-pointer rounded px-1 text-[10px] hover:text-accent"
                          title="New named session"
                        >
                          +
                        </button>
                      </div>
                      {grpOpen &&
                        sessions.map((sess) => {
                          const active =
                            selected?.session.id === sess.id && selected.workspace.id === ws.id;
                          return (
                            <button
                              key={sess.id}
                              type="button"
                              onClick={() => pick({ workspace: ws, group: grp, session: sess })}
                              className={`ml-5 mt-0.5 flex w-[calc(100%-1.25rem)] cursor-pointer flex-col rounded-md px-2 py-1.5 text-left transition-colors ${
                                active ? "bg-accent/15 text-accent" : "hover:bg-bg-card"
                              }`}
                            >
                              <span className="truncate text-[11px] font-medium">{sess.name}</span>
                              <span className="truncate text-[10px] opacity-60">
                                {sess.cwd.replace(/^.*[/\\]/, "") || sess.cwd}
                                {sess.tool ? ` · ${sess.tool}` : ""}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className={`border-t p-2 ${embedded ? "border-[#1f1f1f]" : "border-border"}`}>
          <p className="mb-1.5 truncate text-[10px] opacity-60" title={selected.session.cwd}>
            {selected.session.cwd}
          </p>
          <div className="grid grid-cols-3 gap-1">
            {(["claude", "copilot", "cursor"] as const).map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => onLaunchTool(tool, selected.session.cwd)}
                className="cursor-pointer rounded border py-1 text-[10px] capitalize hover:border-accent/50 hover:text-accent"
              >
                {tool}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void refresh()}
        className={`border-t py-2 text-[11px] ${embedded ? "border-[#1f1f1f]" : "border-border"}`}
      >
        ↻ Refresh
      </button>
    </aside>
  );
}

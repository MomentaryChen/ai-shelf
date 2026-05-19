import { useCallback, useEffect, useState } from "react";
import type { GroupInfo, SessionInfo, WorkspaceInfo, WorkspaceTree } from "../types";

export interface WorkspaceSelection {
  workspace: WorkspaceInfo;
  group: GroupInfo;
  session: SessionInfo;
}

interface Props {
  onSelect: (sel: WorkspaceSelection | null) => void;
  onLaunchTool: (tool: string, cwd: string) => void;
}

export function WorkspaceSidebar({ onSelect, onLaunchTool }: Props) {
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
      setTree({ workspaces: [], groups: {}, sessions: {} });
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

  async function createWorkspace() {
    const name = prompt("Workspace name:");
    if (!name?.trim()) return;
    setBusy(true);
    setErr("");
    const r = await window.api.wsWorkspaceCreate(name.trim());
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

  if (!tree) {
    return (
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-bg-secondary p-3 text-[12px] text-text-secondary">
        {err ? (
          <p className="text-[11px] text-fail">{err}</p>
        ) : (
          "Loading workspaces…"
        )}
      </aside>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Workspaces
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createWorkspace()}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[14px] text-text-secondary hover:bg-bg-card hover:text-accent"
          title="New workspace"
        >
          +
        </button>
      </div>

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
                  className="cursor-pointer rounded px-1 py-1 text-[10px] text-text-tertiary hover:text-text-primary"
                >
                  {wsOpen ? "▼" : "▶"}
                </button>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-primary">
                  {ws.name}
                </span>
                <button
                  type="button"
                  onClick={() => void createGroup(ws)}
                  className="cursor-pointer rounded px-1 text-[11px] text-text-tertiary hover:text-accent"
                  title="New group"
                >
                  +
                </button>
              </div>
              {wsOpen &&
                groups.map((grp) => {
                  const grpKey = `${ws.id}:${grp.id}`;
                  const grpOpen = expandedGrp.has(grpKey);
                  const sessions = (tree.sessions[ws.id] ?? []).filter((s) => s.group_id === grp.id);
                  return (
                    <div key={grp.id} className="ml-4">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleGrp(grpKey)}
                          className="cursor-pointer rounded px-1 py-0.5 text-[10px] text-text-tertiary"
                        >
                          {grpOpen ? "▼" : "▶"}
                        </button>
                        <span className="text-[11px] text-text-secondary">{grp.name}</span>
                        <button
                          type="button"
                          onClick={() => void createSession(ws, grp)}
                          className="cursor-pointer rounded px-1 text-[10px] text-text-tertiary hover:text-accent"
                        >
                          +
                        </button>
                      </div>
                      {grpOpen &&
                        sessions.map((sess) => {
                          const active =
                            selected?.session.id === sess.id &&
                            selected.workspace.id === ws.id;
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
                              <span className="truncate text-[10px] text-text-tertiary">
                                {sess.status}
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
        <div className="border-t border-border p-2">
          <p className="mb-1.5 truncate text-[10px] text-text-tertiary">{selected.session.cwd}</p>
          {selected.session.status === "running" && (
            <button
              type="button"
              onClick={async () => {
                const r = await window.api.wsSessionStop(
                  selected.workspace.name,
                  selected.group.name,
                  selected.session.name,
                );
                if (!r.success) setErr(r.error ?? "Stop failed");
                else void refresh();
              }}
              className="mb-2 w-full cursor-pointer rounded border border-fail/40 py-1 text-[10px] text-fail hover:bg-fail/10"
            >
              Stop managed session
            </button>
          )}
          <div className="grid grid-cols-3 gap-1">
            {(["claude", "copilot", "cursor"] as const).map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => onLaunchTool(tool, selected.session.cwd)}
                className="cursor-pointer rounded border border-border py-1 text-[10px] capitalize text-text-secondary hover:border-accent/50 hover:text-accent"
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
        className="border-t border-border py-2 text-[11px] text-text-tertiary hover:text-text-primary"
      >
        ↻ Refresh
      </button>
    </aside>
  );
}

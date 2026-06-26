import { openDatabase } from "ai-shelf";
import type { GroupLayoutSnapshot } from "ai-shelf";
import { SYNC_BUNDLE_VERSION, type SyncBundle, type SyncLayout, type SyncPreferences, type SyncProfile, type SyncProfileGroup } from "../shared/sync-types.js";
import { closeWorkspaceContext, getWorkspaceContext } from "./workspace-host.js";

const PREF_LAST_ACTIVE_GROUP = "last_active_group";

export function exportLocalSyncBundle(deviceId: string): SyncBundle {
  closeWorkspaceContext();
  const db = openDatabase();
  try {
    const workspaces = db
      .prepare(
        `SELECT id, name, root_path, sort_order, created_at FROM workspaces ORDER BY sort_order, name COLLATE NOCASE`,
      )
      .all() as {
      id: string;
      name: string;
      root_path: string | null;
      sort_order: number;
      created_at: string;
    }[];

    const groups = db
      .prepare(
        `SELECT id, workspace_id, name, sort_order, created_at FROM groups ORDER BY workspace_id, sort_order, name COLLATE NOCASE`,
      )
      .all() as {
      id: string;
      workspace_id: string;
      name: string;
      sort_order: number;
      created_at: string;
    }[];

    const layoutRows = db
      .prepare(
        `SELECT group_id, workspace_id, default_cwd, default_tool, layout_json, panes_json, broadcast_input, accent_color, updated_at
         FROM group_layouts`,
      )
      .all() as {
      group_id: string;
      workspace_id: string;
      default_cwd: string;
      default_tool: string;
      layout_json: string | null;
      panes_json: string;
      broadcast_input: number;
      accent_color: string | null;
      updated_at: string;
    }[];

    const layoutUpdatedByGroup = new Map<string, string>();
    const layouts: SyncLayout[] = [];
    for (const row of layoutRows) {
      layoutUpdatedByGroup.set(row.group_id, row.updated_at);
      let layout: GroupLayoutSnapshot["layout"] = null;
      if (row.layout_json) {
        try {
          layout = JSON.parse(row.layout_json) as GroupLayoutSnapshot["layout"];
        } catch {
          layout = null;
        }
      }
      let panes: GroupLayoutSnapshot["panes"] = [];
      try {
        panes = JSON.parse(row.panes_json) as GroupLayoutSnapshot["panes"];
      } catch {
        panes = [];
      }
      layouts.push({
        profileId: row.group_id,
        workspaceId: row.workspace_id,
        snapshot: {
          defaultCwd: row.default_cwd,
          defaultTool: row.default_tool || "claude",
          panes,
          layout,
          broadcastInput: Boolean(row.broadcast_input),
          accentColor: row.accent_color ?? null,
          updatedAt: row.updated_at,
        },
      });
    }

    const groupUpdatedAt = new Map<string, string>();
    for (const g of groups) {
      groupUpdatedAt.set(g.id, layoutUpdatedByGroup.get(g.id) ?? g.created_at);
    }

    const workspaceUpdatedAt = new Map<string, string>();
    for (const ws of workspaces) {
      let latest = ws.created_at;
      for (const g of groups) {
        if (g.workspace_id !== ws.id) continue;
        const at = groupUpdatedAt.get(g.id) ?? g.created_at;
        if (at > latest) latest = at;
      }
      workspaceUpdatedAt.set(ws.id, latest);
    }

    const profileGroups: SyncProfileGroup[] = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      rootPath: ws.root_path,
      sortOrder: ws.sort_order,
      createdAt: ws.created_at,
      updatedAt: workspaceUpdatedAt.get(ws.id) ?? ws.created_at,
    }));

    const profiles: SyncProfile[] = groups.map((g) => ({
      id: g.id,
      workspaceId: g.workspace_id,
      name: g.name,
      sortOrder: g.sort_order,
      createdAt: g.created_at,
      updatedAt: groupUpdatedAt.get(g.id) ?? g.created_at,
    }));

    const prefRow = db.prepare(`SELECT value FROM app_preferences WHERE key = ?`).get(PREF_LAST_ACTIVE_GROUP) as
      | { value: string }
      | undefined;

    let preferences: SyncPreferences | null = null;
    if (prefRow?.value) {
      preferences = {
        lastActiveGroupKey: prefRow.value,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      version: SYNC_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      deviceId,
      profileGroups,
      profiles,
      layouts,
      preferences,
    };
  } finally {
    db.close();
    getWorkspaceContext();
  }
}

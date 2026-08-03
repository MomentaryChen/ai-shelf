import { openDatabase } from "ai-shelf";
import { SYNC_BUNDLE_VERSION, type SyncBundle } from "../shared/sync-types.js";
import { closeWorkspaceContext, getWorkspaceContext } from "./workspace-host.js";

const PREF_LAST_ACTIVE_GROUP = "last_active_group";
const PREF_LAST_ACTIVE_BY_GROUP = "last_active_by_group";

function isSyncBundle(value: unknown): value is SyncBundle {
  if (!value || typeof value !== "object") return false;
  const bundle = value as SyncBundle;
  return (
    bundle.version === SYNC_BUNDLE_VERSION &&
    typeof bundle.exportedAt === "string" &&
    Array.isArray(bundle.profileGroups) &&
    Array.isArray(bundle.profiles) &&
    Array.isArray(bundle.layouts)
  );
}

function upsertWorkspace(
  db: ReturnType<typeof openDatabase>,
  row: SyncBundle["profileGroups"][number],
): void {
  if (row.deletedAt) {
    db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(row.id);
    return;
  }
  db.prepare(
    `INSERT INTO workspaces (id, name, root_path, sort_order, created_at)
     VALUES (@id, @name, @root_path, @sort_order, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       root_path = excluded.root_path,
       sort_order = excluded.sort_order`,
  ).run({
    id: row.id,
    name: row.name,
    root_path: row.rootPath,
    sort_order: row.sortOrder,
    created_at: row.createdAt,
  });
}

function upsertProfile(
  db: ReturnType<typeof openDatabase>,
  row: SyncBundle["profiles"][number],
): void {
  if (row.deletedAt) {
    db.prepare(`DELETE FROM groups WHERE id = ?`).run(row.id);
    return;
  }
  const workspace = db.prepare(`SELECT id FROM workspaces WHERE id = ?`).get(row.workspaceId);
  if (!workspace) return;
  db.prepare(
    `INSERT INTO groups (id, workspace_id, name, sort_order, created_at)
     VALUES (@id, @workspace_id, @name, @sort_order, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       name = excluded.name,
       sort_order = excluded.sort_order`,
  ).run({
    id: row.id,
    workspace_id: row.workspaceId,
    name: row.name,
    sort_order: row.sortOrder,
    created_at: row.createdAt,
  });
}

function upsertLayout(
  db: ReturnType<typeof openDatabase>,
  row: SyncBundle["layouts"][number],
): void {
  if (row.deletedAt) {
    db.prepare(`DELETE FROM group_layouts WHERE group_id = ?`).run(row.profileId);
    return;
  }
  const group = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(row.profileId);
  if (!group) return;
  const snapshot = row.snapshot;
  const existingLayout = db
    .prepare(`SELECT saved_commands_json FROM group_layouts WHERE group_id = ?`)
    .get(row.profileId) as { saved_commands_json: string } | undefined;
  const savedCommandsJson =
    snapshot.savedCommands !== undefined
      ? JSON.stringify(snapshot.savedCommands)
      : (existingLayout?.saved_commands_json ?? "[]");
  db.prepare(
    `INSERT INTO group_layouts (group_id, workspace_id, default_cwd, default_tool, layout_json, panes_json, broadcast_input, accent_color, saved_commands_json, updated_at)
     VALUES (@group_id, @workspace_id, @default_cwd, @default_tool, @layout_json, @panes_json, @broadcast_input, @accent_color, @saved_commands_json, @updated_at)
     ON CONFLICT(group_id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       default_cwd = excluded.default_cwd,
       default_tool = excluded.default_tool,
       layout_json = excluded.layout_json,
       panes_json = excluded.panes_json,
       broadcast_input = excluded.broadcast_input,
       accent_color = excluded.accent_color,
       saved_commands_json = excluded.saved_commands_json,
       updated_at = excluded.updated_at`,
  ).run({
    group_id: row.profileId,
    workspace_id: row.workspaceId,
    default_cwd: snapshot.defaultCwd,
    default_tool: snapshot.defaultTool ?? "claude",
    layout_json: snapshot.layout ? JSON.stringify(snapshot.layout) : null,
    panes_json: JSON.stringify(snapshot.panes),
    broadcast_input: snapshot.broadcastInput ? 1 : 0,
    accent_color: snapshot.accentColor ?? null,
    saved_commands_json: savedCommandsJson,
    updated_at: snapshot.updatedAt,
  });
}

export function applySyncBundle(bundle: unknown): { ok: true } | { ok: false; error: string } {
  if (!isSyncBundle(bundle)) {
    return { ok: false, error: "Invalid sync bundle" };
  }

  closeWorkspaceContext();
  const db = openDatabase();
  try {
    const apply = db.transaction((data: SyncBundle) => {
      for (const group of data.profileGroups) {
        upsertWorkspace(db, group);
      }
      for (const profile of data.profiles) {
        upsertProfile(db, profile);
      }
      for (const layout of data.layouts) {
        upsertLayout(db, layout);
      }
      if (data.preferences?.lastActiveGroupKey) {
        db.prepare(
          `INSERT INTO app_preferences (key, value) VALUES (@key, @value)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run({ key: PREF_LAST_ACTIVE_GROUP, value: data.preferences.lastActiveGroupKey });
      }
      if (data.preferences?.lastActiveByGroup) {
        db.prepare(
          `INSERT INTO app_preferences (key, value) VALUES (@key, @value)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run({
          key: PREF_LAST_ACTIVE_BY_GROUP,
          value: JSON.stringify(data.preferences.lastActiveByGroup),
        });
      }
    });
    apply(bundle);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    db.close();
    getWorkspaceContext();
  }
}

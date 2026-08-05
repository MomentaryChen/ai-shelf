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
  options: ApplySyncBundleOptions = {},
): void {
  if (row.deletedAt) {
    db.prepare(`DELETE FROM group_layouts WHERE group_id = ?`).run(row.profileId);
    return;
  }
  const group = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(row.profileId);
  if (!group) return;
  const snapshot = row.snapshot;
  // Merge upsert may keep local saved commands when the bundle omits them.
  // Prefer-cloud replace must take the bundle value (default []) so overwrite is complete.
  let savedCommandsJson: string;
  if (options.replace || snapshot.savedCommands !== undefined) {
    savedCommandsJson = JSON.stringify(snapshot.savedCommands ?? []);
  } else {
    const existingLayout = db
      .prepare(`SELECT saved_commands_json FROM group_layouts WHERE group_id = ?`)
      .get(row.profileId) as { saved_commands_json: string } | undefined;
    savedCommandsJson = existingLayout?.saved_commands_json ?? "[]";
  }
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

export interface ApplySyncBundleOptions {
  /**
   * When true, clear local workspaces/profiles/layouts then insert the bundle
   * so prefer-cloud is a true overwrite (not upsert-merge).
   */
  replace?: boolean;
}

/** Clear local sync-owned tables so prefer-cloud can insert without UNIQUE name clashes. */
function clearLocalSyncTables(db: ReturnType<typeof openDatabase>): void {
  db.prepare(`DELETE FROM group_layouts`).run();
  db.prepare(`DELETE FROM groups`).run();
  db.prepare(`DELETE FROM workspaces`).run();
}

function applyPreferences(
  db: ReturnType<typeof openDatabase>,
  preferences: SyncBundle["preferences"],
  replace: boolean,
): void {
  const deletePref = db.prepare(`DELETE FROM app_preferences WHERE key = ?`);
  const upsertPref = db.prepare(
    `INSERT INTO app_preferences (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  if (replace && !preferences) {
    deletePref.run(PREF_LAST_ACTIVE_GROUP);
    deletePref.run(PREF_LAST_ACTIVE_BY_GROUP);
    return;
  }
  if (!preferences) return;

  if (preferences.lastActiveGroupKey) {
    upsertPref.run({ key: PREF_LAST_ACTIVE_GROUP, value: preferences.lastActiveGroupKey });
  } else if (replace) {
    deletePref.run(PREF_LAST_ACTIVE_GROUP);
  }

  if (preferences.lastActiveByGroup) {
    upsertPref.run({
      key: PREF_LAST_ACTIVE_BY_GROUP,
      value: JSON.stringify(preferences.lastActiveByGroup),
    });
  } else if (replace) {
    deletePref.run(PREF_LAST_ACTIVE_BY_GROUP);
  }
}

export function applySyncBundle(
  bundle: unknown,
  options: ApplySyncBundleOptions = {},
): { ok: true } | { ok: false; error: string } {
  if (!isSyncBundle(bundle)) {
    return { ok: false, error: "Invalid sync bundle" };
  }

  closeWorkspaceContext();
  const db = openDatabase();
  try {
    const apply = db.transaction((data: SyncBundle) => {
      // Full clear before insert avoids UNIQUE(name) clashes on rename/id swaps.
      if (options.replace) {
        clearLocalSyncTables(db);
      }
      for (const group of data.profileGroups) {
        upsertWorkspace(db, group);
      }
      for (const profile of data.profiles) {
        upsertProfile(db, profile);
      }
      for (const layout of data.layouts) {
        upsertLayout(db, layout, options);
      }
      applyPreferences(db, data.preferences, options.replace === true);
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

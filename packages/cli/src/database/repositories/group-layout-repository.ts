import type Database from "better-sqlite3";
import {
  GroupLayoutMetaSchema,
  GroupLayoutSnapshotSchema,
  type GroupLayoutMeta,
  type GroupLayoutSnapshot,
} from "../../models/group-layout.js";
import { DatabaseError } from "../../core/errors/app-error.js";

const PREF_LAST_ACTIVE_GROUP = "last_active_group";
/** JSON map: profileGroupId → last active profileId within that group. */
const PREF_LAST_ACTIVE_BY_GROUP = "last_active_by_group";

export class GroupLayoutRepository {
  constructor(private readonly db: Database.Database) {}

  findByGroupId(groupId: string): GroupLayoutSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT default_cwd, default_tool, layout_json, panes_json, broadcast_input, accent_color, saved_commands_json, updated_at
         FROM group_layouts WHERE group_id = ?`,
      )
      .get(groupId) as
      | {
          default_cwd: string;
          default_tool: string;
          layout_json: string | null;
          panes_json: string;
          broadcast_input: number;
          accent_color: string | null;
          saved_commands_json: string;
          updated_at: string;
        }
      | undefined;

    if (!row) return null;

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

    let savedCommands: GroupLayoutSnapshot["savedCommands"] = [];
    try {
      savedCommands = JSON.parse(row.saved_commands_json ?? "[]") as GroupLayoutSnapshot["savedCommands"];
    } catch {
      savedCommands = [];
    }

    return GroupLayoutSnapshotSchema.parse({
      defaultCwd: row.default_cwd,
      defaultTool: row.default_tool || "claude",
      panes,
      layout,
      broadcastInput: Boolean(row.broadcast_input),
      accentColor: row.accent_color ?? null,
      savedCommands,
      updatedAt: row.updated_at,
    });
  }

  upsert(groupId: string, workspaceId: string, snapshot: GroupLayoutSnapshot): GroupLayoutSnapshot {
    const parsed = GroupLayoutSnapshotSchema.parse(snapshot);
    const existing = this.findByGroupId(groupId);
    const accentColor =
      parsed.accentColor !== undefined ? parsed.accentColor : (existing?.accentColor ?? null);
    const savedCommands =
      parsed.savedCommands !== undefined ? parsed.savedCommands : (existing?.savedCommands ?? []);
    const now = parsed.updatedAt || new Date().toISOString();
    const stored = { ...parsed, accentColor, savedCommands, updatedAt: now };

    this.db
      .prepare(
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
      )
      .run({
        group_id: groupId,
        workspace_id: workspaceId,
        default_cwd: parsed.defaultCwd,
        default_tool: parsed.defaultTool ?? "claude",
        layout_json: parsed.layout ? JSON.stringify(parsed.layout) : null,
        panes_json: JSON.stringify(parsed.panes),
        broadcast_input: parsed.broadcastInput ? 1 : 0,
        accent_color: accentColor,
        saved_commands_json: JSON.stringify(stored.savedCommands ?? []),
        updated_at: now,
      });

    return stored;
  }

  listMetaByWorkspace(): Map<string, GroupLayoutMeta> {
    const rows = this.db
      .prepare(
        `SELECT group_id, workspace_id, default_cwd, default_tool, panes_json, broadcast_input, accent_color, updated_at FROM group_layouts`,
      )
      .all() as {
      group_id: string;
      workspace_id: string;
      default_cwd: string;
      default_tool: string;
      panes_json: string;
      broadcast_input: number;
      accent_color: string | null;
      updated_at: string;
    }[];

    const out = new Map<string, GroupLayoutMeta>();
    for (const row of rows) {
      let paneCount = 0;
      try {
        const panes = JSON.parse(row.panes_json) as unknown[];
        paneCount = Array.isArray(panes) ? Math.min(panes.length, 4) : 0;
      } catch {
        paneCount = 0;
      }
      const key = `${row.workspace_id}:${row.group_id}`;
      out.set(
        key,
        GroupLayoutMetaSchema.parse({
          paneCount,
          defaultCwd: row.default_cwd,
          defaultTool: row.default_tool || "claude",
          broadcastInput: Boolean(row.broadcast_input),
          accentColor: row.accent_color ?? null,
          updatedAt: row.updated_at,
        }),
      );
    }
    return out;
  }

  getPreference(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM app_preferences WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setPreference(key: string, value: string): void {
    try {
      this.db
        .prepare(
          `INSERT INTO app_preferences (key, value) VALUES (@key, @value)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run({ key, value });
    } catch (err) {
      throw new DatabaseError(`Failed to save preference "${key}"`, err);
    }
  }

  getLastActiveGroupKey(): string | null {
    return this.getPreference(PREF_LAST_ACTIVE_GROUP);
  }

  /** Last opened profile id per profile group (workspace row id). */
  getLastActiveByGroup(): Record<string, string> {
    const map = this.readLastActiveByGroup();
    const last = this.getLastActiveGroupKey();
    if (last) {
      const colon = last.indexOf(":");
      if (colon > 0) {
        const groupId = last.slice(0, colon);
        const profileId = last.slice(colon + 1);
        if (groupId && profileId && !map[groupId]) {
          map[groupId] = profileId;
        }
      }
    }
    return map;
  }

  setLastActiveGroupKey(workspaceId: string, groupId: string): void {
    this.setPreference(PREF_LAST_ACTIVE_GROUP, `${workspaceId}:${groupId}`);
    const map = this.readLastActiveByGroup();
    map[workspaceId] = groupId;
    this.setPreference(PREF_LAST_ACTIVE_BY_GROUP, JSON.stringify(map));
  }

  clearLastActiveGroupKey(): void {
    this.db.prepare(`DELETE FROM app_preferences WHERE key = ?`).run(PREF_LAST_ACTIVE_GROUP);
  }

  /** Drop a group's remembered profile (e.g. group deleted). */
  clearLastActiveForGroup(workspaceId: string): void {
    const map = this.readLastActiveByGroup();
    if (!(workspaceId in map)) return;
    delete map[workspaceId];
    this.setPreference(PREF_LAST_ACTIVE_BY_GROUP, JSON.stringify(map));
  }

  /** Drop a remembered profile if it matches (e.g. profile deleted). */
  clearLastActiveForProfile(workspaceId: string, profileId: string): void {
    const map = this.readLastActiveByGroup();
    if (map[workspaceId] !== profileId) return;
    delete map[workspaceId];
    this.setPreference(PREF_LAST_ACTIVE_BY_GROUP, JSON.stringify(map));
  }

  private readLastActiveByGroup(): Record<string, string> {
    const raw = this.getPreference(PREF_LAST_ACTIVE_BY_GROUP);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string" && k && v) out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }
}

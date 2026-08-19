import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { GroupRepositoryPort } from "../../core/ports/repositories.js";
import {
  GroupModelSchema,
  CreateGroupInputSchema,
  type GroupModel,
  type CreateGroupInput,
} from "../../models/group.js";
import { DatabaseError } from "../../core/errors/app-error.js";

export class GroupRepository implements GroupRepositoryPort {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateGroupInput): GroupModel {
    const parsed = CreateGroupInputSchema.parse(input);
    const now = new Date().toISOString();
    const maxRow = this.db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM groups WHERE workspace_id = ?`,
      )
      .get(parsed.workspace_id) as { max_order: number };
    const row = {
      id: randomUUID(),
      workspace_id: parsed.workspace_id,
      name: parsed.name,
      sort_order: maxRow.max_order + 1,
      created_at: now,
    };

    try {
      this.db
        .prepare(
          `INSERT INTO groups (id, workspace_id, name, sort_order, created_at) VALUES (@id, @workspace_id, @name, @sort_order, @created_at)`,
        )
        .run(row);
    } catch (err) {
      throw new DatabaseError(`Group "${parsed.name}" already exists or is invalid`, err);
    }

    return GroupModelSchema.parse(row);
  }

  listByWorkspace(workspaceId: string): GroupModel[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM groups WHERE workspace_id = ? ORDER BY sort_order, name COLLATE NOCASE`,
      )
      .all(workspaceId);
    return rows.map((r) => GroupModelSchema.parse(r));
  }

  findByName(workspaceId: string, name: string): GroupModel | null {
    const row = this.db
      .prepare(`SELECT * FROM groups WHERE workspace_id = ? AND name = ?`)
      .get(workspaceId, name);
    return row ? GroupModelSchema.parse(row) : null;
  }

  rename(workspaceId: string, groupId: string, name: string): GroupModel {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new DatabaseError("Group name is required");
    }
    const existing = this.db
      .prepare(`SELECT * FROM groups WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, groupId);
    if (!existing) {
      throw new DatabaseError("Group not found");
    }
    const duplicate = this.findByName(workspaceId, trimmed);
    if (duplicate && duplicate.id !== groupId) {
      throw new DatabaseError(`Group "${trimmed}" already exists`);
    }
    try {
      this.db
        .prepare(`UPDATE groups SET name = ? WHERE workspace_id = ? AND id = ?`)
        .run(trimmed, workspaceId, groupId);
    } catch (err) {
      throw new DatabaseError(`Failed to rename group to "${trimmed}"`, err);
    }
    const row = this.db
      .prepare(`SELECT * FROM groups WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, groupId);
    return GroupModelSchema.parse(row);
  }

  reorder(workspaceId: string, orderedGroupIds: string[]): void {
    const existing = this.listByWorkspace(workspaceId);
    if (orderedGroupIds.length !== existing.length) {
      throw new DatabaseError("Reorder list must include every group in the workspace");
    }
    const idSet = new Set(existing.map((g) => g.id));
    for (const id of orderedGroupIds) {
      if (!idSet.has(id)) {
        throw new DatabaseError("Reorder list contains unknown group id");
      }
    }
    const update = this.db.prepare(
      `UPDATE groups SET sort_order = ? WHERE workspace_id = ? AND id = ?`,
    );
    const run = this.db.transaction((ids: string[]) => {
      ids.forEach((id, index) => update.run(index, workspaceId, id));
    });
    run(orderedGroupIds);
  }

  moveToWorkspace(groupId: string, targetWorkspaceId: string): GroupModel {
    const existing = this.db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId) as
      | { id: string; workspace_id: string; name: string; sort_order: number; created_at: string }
      | undefined;
    if (!existing) {
      throw new DatabaseError("Group not found");
    }
    if (existing.workspace_id === targetWorkspaceId) {
      return GroupModelSchema.parse(existing);
    }
    const target = this.db
      .prepare(`SELECT id FROM workspaces WHERE id = ?`)
      .get(targetWorkspaceId) as { id: string } | undefined;
    if (!target) {
      throw new DatabaseError("Workspace not found");
    }
    const duplicate = this.findByName(targetWorkspaceId, existing.name);
    if (duplicate) {
      throw new DatabaseError(`Group "${existing.name}" already exists`);
    }
    const maxRow = this.db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM groups WHERE workspace_id = ?`,
      )
      .get(targetWorkspaceId) as { max_order: number };
    const nextOrder = maxRow.max_order + 1;

    const run = this.db.transaction(() => {
      this.db
        .prepare(`UPDATE groups SET workspace_id = ?, sort_order = ? WHERE id = ?`)
        .run(targetWorkspaceId, nextOrder, groupId);
      this.db
        .prepare(`UPDATE group_layouts SET workspace_id = ? WHERE group_id = ?`)
        .run(targetWorkspaceId, groupId);
      this.db
        .prepare(`UPDATE sessions SET workspace_id = ? WHERE group_id = ?`)
        .run(targetWorkspaceId, groupId);
    });
    try {
      run();
    } catch (err) {
      throw new DatabaseError(`Failed to move group "${existing.name}"`, err);
    }

    const row = this.db.prepare(`SELECT * FROM groups WHERE id = ?`).get(groupId);
    return GroupModelSchema.parse(row);
  }

  deleteByName(workspaceId: string, name: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM groups WHERE workspace_id = ? AND name = ?`)
      .run(workspaceId, name);
    return result.changes > 0;
  }
}

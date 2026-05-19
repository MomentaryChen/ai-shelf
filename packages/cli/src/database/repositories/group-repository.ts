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
    const row = {
      id: randomUUID(),
      workspace_id: parsed.workspace_id,
      name: parsed.name,
      created_at: now,
    };

    try {
      this.db
        .prepare(
          `INSERT INTO groups (id, workspace_id, name, created_at) VALUES (@id, @workspace_id, @name, @created_at)`,
        )
        .run(row);
    } catch (err) {
      throw new DatabaseError(`Group "${parsed.name}" already exists or is invalid`, err);
    }

    return GroupModelSchema.parse(row);
  }

  listByWorkspace(workspaceId: string): GroupModel[] {
    const rows = this.db
      .prepare(`SELECT * FROM groups WHERE workspace_id = ? ORDER BY name`)
      .all(workspaceId);
    return rows.map((r) => GroupModelSchema.parse(r));
  }

  findByName(workspaceId: string, name: string): GroupModel | null {
    const row = this.db
      .prepare(`SELECT * FROM groups WHERE workspace_id = ? AND name = ?`)
      .get(workspaceId, name);
    return row ? GroupModelSchema.parse(row) : null;
  }

  deleteByName(workspaceId: string, name: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM groups WHERE workspace_id = ? AND name = ?`)
      .run(workspaceId, name);
    return result.changes > 0;
  }
}

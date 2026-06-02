import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { WorkspaceRepositoryPort } from "../../core/ports/repositories.js";
import {
  WorkspaceModelSchema,
  CreateWorkspaceInputSchema,
  type WorkspaceModel,
  type CreateWorkspaceInput,
} from "../../models/workspace.js";
import { DatabaseError } from "../../core/errors/app-error.js";

export class WorkspaceRepository implements WorkspaceRepositoryPort {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateWorkspaceInput): WorkspaceModel {
    const parsed = CreateWorkspaceInputSchema.parse(input);
    const now = new Date().toISOString();
    const maxRow = this.db
      .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM workspaces`)
      .get() as { max_order: number };
    const row = {
      id: randomUUID(),
      name: parsed.name,
      root_path: parsed.root_path ?? null,
      sort_order: maxRow.max_order + 1,
      created_at: now,
    };

    try {
      this.db
        .prepare(
          `INSERT INTO workspaces (id, name, root_path, sort_order, created_at) VALUES (@id, @name, @root_path, @sort_order, @created_at)`,
        )
        .run(row);
    } catch (err) {
      throw new DatabaseError(`Workspace "${parsed.name}" already exists or is invalid`, err);
    }

    return WorkspaceModelSchema.parse(row);
  }

  list(): WorkspaceModel[] {
    const rows = this.db
      .prepare(`SELECT * FROM workspaces ORDER BY sort_order, name COLLATE NOCASE`)
      .all();
    return rows.map((r) => WorkspaceModelSchema.parse(r));
  }

  findById(id: string): WorkspaceModel | null {
    const row = this.db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id);
    return row ? WorkspaceModelSchema.parse(row) : null;
  }

  findByName(name: string): WorkspaceModel | null {
    const row = this.db.prepare(`SELECT * FROM workspaces WHERE name = ?`).get(name);
    return row ? WorkspaceModelSchema.parse(row) : null;
  }

  rename(id: string, name: string): WorkspaceModel {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new DatabaseError("Workspace name is required", new Error("empty name"));
    }
    try {
      this.db.prepare(`UPDATE workspaces SET name = ? WHERE id = ?`).run(trimmed, id);
    } catch (err) {
      throw new DatabaseError(`Workspace rename failed`, err);
    }
    const row = this.db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id);
    if (!row) throw new DatabaseError(`Workspace not found`, new Error(id));
    return WorkspaceModelSchema.parse(row);
  }

  reorder(orderedWorkspaceIds: string[]): void {
    const updateStmt = this.db.prepare(`UPDATE workspaces SET sort_order = ? WHERE id = ?`);
    orderedWorkspaceIds.forEach((id, index) => updateStmt.run(index, id));
  }

  deleteByName(name: string): boolean {
    const result = this.db.prepare(`DELETE FROM workspaces WHERE name = ?`).run(name);
    return result.changes > 0;
  }

  deleteById(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
    return result.changes > 0;
  }
}

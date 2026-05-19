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
    const row = {
      id: randomUUID(),
      name: parsed.name,
      root_path: parsed.root_path ?? null,
      created_at: now,
    };

    try {
      this.db
        .prepare(
          `INSERT INTO workspaces (id, name, root_path, created_at) VALUES (@id, @name, @root_path, @created_at)`,
        )
        .run(row);
    } catch (err) {
      throw new DatabaseError(`Workspace "${parsed.name}" already exists or is invalid`, err);
    }

    return WorkspaceModelSchema.parse(row);
  }

  list(): WorkspaceModel[] {
    const rows = this.db.prepare(`SELECT * FROM workspaces ORDER BY name`).all();
    return rows.map((r) => WorkspaceModelSchema.parse(r));
  }

  findByName(name: string): WorkspaceModel | null {
    const row = this.db.prepare(`SELECT * FROM workspaces WHERE name = ?`).get(name);
    return row ? WorkspaceModelSchema.parse(row) : null;
  }

  deleteByName(name: string): boolean {
    const result = this.db.prepare(`DELETE FROM workspaces WHERE name = ?`).run(name);
    return result.changes > 0;
  }
}

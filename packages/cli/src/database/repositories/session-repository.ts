import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type Database from "better-sqlite3";
import type { SessionRepositoryPort } from "../../core/ports/repositories.js";
import {
  SessionModelSchema,
  CreateSessionInputSchema,
  type SessionModel,
  type CreateSessionInput,
} from "../../models/session.js";
import { DatabaseError } from "../../core/errors/app-error.js";

export class SessionRepository implements SessionRepositoryPort {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateSessionInput): SessionModel {
    const parsed = CreateSessionInputSchema.parse(input);
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      workspace_id: parsed.workspace_id,
      group_id: parsed.group_id,
      name: parsed.name,
      cwd: parsed.cwd ?? homedir(),
      shell: parsed.shell ?? "pwsh",
      tool: parsed.tool ?? null,
      pid: null,
      status: "pending" as const,
      created_at: now,
      updated_at: now,
    };

    try {
      this.db
        .prepare(
          `INSERT INTO sessions (id, workspace_id, group_id, name, cwd, shell, tool, pid, status, created_at, updated_at)
           VALUES (@id, @workspace_id, @group_id, @name, @cwd, @shell, @tool, @pid, @status, @created_at, @updated_at)`,
        )
        .run(row);
    } catch (err) {
      throw new DatabaseError(`Session "${parsed.name}" already exists or is invalid`, err);
    }

    return SessionModelSchema.parse(row);
  }

  listByGroup(workspaceId: string, groupId: string): SessionModel[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions WHERE workspace_id = ? AND group_id = ? ORDER BY name`,
      )
      .all(workspaceId, groupId);
    return rows.map((r) => SessionModelSchema.parse(r));
  }

  listByWorkspace(workspaceId: string): SessionModel[] {
    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE workspace_id = ? ORDER BY name`)
      .all(workspaceId);
    return rows.map((r) => SessionModelSchema.parse(r));
  }

  findById(id: string): SessionModel | null {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    return row ? SessionModelSchema.parse(row) : null;
  }

  updateRuntime(
    id: string,
    patch: { pid?: number | null; status: SessionModel["status"] },
  ): SessionModel {
    const existing = this.findById(id);
    if (!existing) throw new DatabaseError(`Session not found: ${id}`);

    const updated = {
      ...existing,
      pid: patch.pid !== undefined ? patch.pid : existing.pid,
      status: patch.status,
      updated_at: new Date().toISOString(),
    };

    this.db
      .prepare(
        `UPDATE sessions SET pid = @pid, status = @status, updated_at = @updated_at WHERE id = @id`,
      )
      .run(updated);

    return SessionModelSchema.parse(updated);
  }

  findByName(workspaceId: string, groupId: string, name: string): SessionModel | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sessions WHERE workspace_id = ? AND group_id = ? AND name = ?`,
      )
      .get(workspaceId, groupId, name);
    return row ? SessionModelSchema.parse(row) : null;
  }

  deleteByName(workspaceId: string, groupId: string, name: string): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM sessions WHERE workspace_id = ? AND group_id = ? AND name = ?`,
      )
      .run(workspaceId, groupId, name);
    return result.changes > 0;
  }
}

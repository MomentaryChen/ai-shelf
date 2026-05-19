import type Database from "better-sqlite3";

export interface CommandHistoryEntry {
  id: number;
  workspace_id: string | null;
  group_id: string | null;
  session_id: string | null;
  command: string;
  created_at: string;
}

export class CommandHistoryRepository {
  constructor(private readonly db: Database.Database) {}

  append(entry: Omit<CommandHistoryEntry, "id" | "created_at">): void {
    this.db
      .prepare(
        `INSERT INTO command_history (workspace_id, group_id, session_id, command, created_at)
         VALUES (@workspace_id, @group_id, @session_id, @command, @created_at)`,
      )
      .run({ ...entry, created_at: new Date().toISOString() });
  }

  listRecent(limit = 20): CommandHistoryEntry[] {
    return this.db
      .prepare(`SELECT * FROM command_history ORDER BY id DESC LIMIT ?`)
      .all(limit) as CommandHistoryEntry[];
  }
}

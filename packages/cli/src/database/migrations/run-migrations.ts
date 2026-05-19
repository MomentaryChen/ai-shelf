import type Database from "better-sqlite3";

const SCHEMA_VERSION = 3;

const MIGRATION_V2 = `
ALTER TABLE sessions ADD COLUMN tool TEXT;
`;

const MIGRATION_V3 = `
CREATE TABLE IF NOT EXISTS command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT,
  group_id TEXT,
  session_id TEXT,
  command TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  root_path TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  shell TEXT NOT NULL,
  tool TEXT,
  pid INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(group_id, name)
);

CREATE INDEX IF NOT EXISTS idx_groups_workspace ON groups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
`;

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY
    );
  `);

  const row = db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;

  const current = row?.version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    db.exec(INITIAL_SCHEMA);
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(1);
  }

  if (current < 2) {
    try {
      db.exec(MIGRATION_V2);
    } catch {
      /* column may already exist on fresh schema */
    }
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(2);
  }

  if (current < 3) {
    db.exec(MIGRATION_V3);
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(3);
  }
}

import type Database from "better-sqlite3";

const SCHEMA_VERSION = 9;

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

const MIGRATION_V4 = `
CREATE TABLE IF NOT EXISTS group_layouts (
  group_id TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  default_cwd TEXT NOT NULL DEFAULT '',
  layout_json TEXT,
  panes_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_layouts_workspace ON group_layouts(workspace_id);
`;

const MIGRATION_V5 = `
ALTER TABLE group_layouts ADD COLUMN broadcast_input INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_V6 = `
ALTER TABLE group_layouts ADD COLUMN default_tool TEXT NOT NULL DEFAULT 'claude';
`;

const MIGRATION_V7 = `
ALTER TABLE group_layouts ADD COLUMN accent_color TEXT;
`;

const MIGRATION_V8 = `
ALTER TABLE groups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_V9 = `
ALTER TABLE workspaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
`;

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  root_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
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

  if (current < 4) {
    db.exec(MIGRATION_V4);
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(4);
  }

  if (current < 5) {
    try {
      db.exec(MIGRATION_V5);
    } catch {
      /* column may exist */
    }
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(5);
  }

  if (current < 6) {
    try {
      db.exec(MIGRATION_V6);
    } catch {
      /* column may exist */
    }
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(6);
  }

  if (current < 7) {
    try {
      db.exec(MIGRATION_V7);
    } catch {
      /* column may exist */
    }
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(7);
  }

  if (current < 8) {
    try {
      db.exec(MIGRATION_V8);
    } catch {
      /* column may exist */
    }
    backfillGroupSortOrder(db);
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(8);
  }

  if (current < 9) {
    try {
      db.exec(MIGRATION_V9);
    } catch {
      /* column may exist */
    }
    backfillWorkspaceSortOrder(db);
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version) VALUES (?)").run(9);
  }
}

function backfillWorkspaceSortOrder(db: Database.Database): void {
  const rows = db
    .prepare(`SELECT id FROM workspaces ORDER BY name COLLATE NOCASE`)
    .all() as { id: string }[];
  const updateStmt = db.prepare(`UPDATE workspaces SET sort_order = ? WHERE id = ?`);
  rows.forEach((row, index) => updateStmt.run(index, row.id));
}

function backfillGroupSortOrder(db: Database.Database): void {
  const workspaces = db
    .prepare(`SELECT DISTINCT workspace_id AS workspace_id FROM groups`)
    .all() as { workspace_id: string }[];
  const listStmt = db.prepare(
    `SELECT id FROM groups WHERE workspace_id = ? ORDER BY name COLLATE NOCASE`,
  );
  const updateStmt = db.prepare(`UPDATE groups SET sort_order = ? WHERE id = ?`);
  for (const { workspace_id } of workspaces) {
    const groups = listStmt.all(workspace_id) as { id: string }[];
    groups.forEach((g, index) => updateStmt.run(index, g.id));
  }
}

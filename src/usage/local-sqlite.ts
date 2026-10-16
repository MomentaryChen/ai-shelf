import { existsSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

/** Thrown when no local data file exists for a tool — surfaced as "no local data", not an error. */
export class LocalUsageNotFoundError extends Error {
  constructor(message = "No local usage data found") {
    super(message);
    this.name = "LocalUsageNotFoundError";
  }
}

type SqliteModule = typeof import("node:sqlite");
let sqliteModule: Promise<SqliteModule> | null = null;

async function loadSqlite(): Promise<SqliteModule> {
  sqliteModule ??= import("node:sqlite").catch((err: unknown) => {
    sqliteModule = null;
    throw new Error(`Built-in SQLite reader is unavailable: ${(err as Error).message}`);
  });
  return sqliteModule;
}

/**
 * Open another tool's SQLite database read-only, run `fn`, and always close it.
 * Uses the runtime's built-in `node:sqlite` (Electron 41 / Node ≥ 22.5) so no native rebuild is needed.
 */
export async function withReadOnlySqlite<T>(path: string, fn: (db: DatabaseSync) => T): Promise<T> {
  const { DatabaseSync } = await loadSqlite();
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    // Another process (the CLI itself) may be writing; wait briefly instead of failing on SQLITE_BUSY.
    db.exec("PRAGMA busy_timeout = 2000");
    return fn(db);
  } finally {
    db.close();
  }
}

export function sqliteTableNames(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name?: unknown }>;
  return new Set(rows.map((r) => (typeof r.name === "string" ? r.name : "")));
}

export function sqliteColumnNames(db: DatabaseSync, table: string): Set<string> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return new Set();
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  return new Set(rows.map((r) => (typeof r.name === "string" ? r.name : "")));
}

/** mtime+size of a file and its WAL sidecar — changes whenever the owning tool writes. */
export function fileSignature(path: string): string {
  const parts: string[] = [];
  for (const p of [path, `${path}-wal`]) {
    try {
      if (!existsSync(p)) continue;
      const st = statSync(p);
      parts.push(`${p}:${String(st.mtimeMs)}:${String(st.size)}`);
    } catch {
      /* ignore races with the writer */
    }
  }
  return parts.join("|");
}

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { signature: string; at: number; value: unknown }>();

/**
 * Memoize a local read until the underlying files change (or 5 minutes pass),
 * so dashboard refreshes do not re-scan unchanged databases.
 */
export async function cachedLocalRead<T>(
  key: string,
  signature: string,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.signature === signature && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value as T;
  }
  const value = await compute();
  cache.set(key, { signature, at: Date.now(), value });
  return value;
}

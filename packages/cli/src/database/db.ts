import Database from "better-sqlite3";
import { getDatabasePath, ensureAppDataDir } from "../config/loader.js";
import { runMigrations } from "./migrations/run-migrations.js";
import { DatabaseError } from "../core/errors/app-error.js";

export type SqliteDatabase = Database.Database;

export function openDatabase(dbPath?: string): SqliteDatabase {
  try {
    ensureAppDataDir();
    const path = dbPath ?? getDatabasePath();
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    return db;
  } catch (err) {
    throw new DatabaseError("Failed to open database", err);
  }
}

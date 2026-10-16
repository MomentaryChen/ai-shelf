import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  LocalUsageNotFoundError,
  cachedLocalRead,
  fileSignature,
  sqliteColumnNames,
  sqliteTableNames,
  withReadOnlySqlite,
} from "../local-sqlite.js";
import {
  type LocalUsageRecord,
  type LocalUsageResult,
  epochToMs,
  summarizeLocalUsage,
  toNumber,
  windowStartMs,
} from "./local-usage.js";

/**
 * Crush global data dir (holds projects.json), mirroring `config.GlobalConfigData()` upstream:
 * `$CRUSH_GLOBAL_DATA` → `$XDG_DATA_HOME/crush` → `%LOCALAPPDATA%\crush` (Windows) → `~/.local/share/crush`.
 */
export function crushGlobalDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  const override = env["CRUSH_GLOBAL_DATA"]?.trim();
  if (override) return override;
  const xdg = env["XDG_DATA_HOME"]?.trim();
  if (xdg) return join(xdg, "crush");
  if (platform === "win32") {
    const local = env["LOCALAPPDATA"]?.trim() || join(env["USERPROFILE"]?.trim() || home, "AppData", "Local");
    return join(local, "crush");
  }
  return join(home, ".local", "share", "crush");
}

/**
 * Resolve per-project `crush.db` paths from projects.json. Accepts the current
 * `{ projects: [...] }` shape, a bare array, or an object keyed by project id.
 */
export function parseCrushProjects(json: unknown): string[] {
  let entries: unknown[] = [];
  if (Array.isArray(json)) entries = json;
  else if (json && typeof json === "object") {
    const projects = (json as { projects?: unknown }).projects;
    entries = Array.isArray(projects) ? projects : Object.values(json as Record<string, unknown>);
  }

  const dbs = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const { path, data_dir: dataDir } = entry as { path?: unknown; data_dir?: unknown };
    if (typeof path !== "string" || !path.trim()) continue;
    const dir = typeof dataDir === "string" && dataDir.trim() ? dataDir.trim() : ".crush";
    dbs.add(join(isAbsolute(dir) ? dir : join(path.trim(), dir), "crush.db"));
  }
  return [...dbs];
}

/**
 * Parse one Crush `sessions` row. Crush records totals per session (no per-message tokens),
 * so the whole session is attributed to its last update time. Timestamps are epoch seconds.
 */
export function parseCrushSession(
  row: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    cost?: unknown;
    created_at?: unknown;
    updated_at?: unknown;
  },
  model?: string | null,
): LocalUsageRecord | null {
  const timestampMs = epochToMs(row.updated_at) || epochToMs(row.created_at);
  if (!timestampMs) return null;
  return {
    timestampMs,
    costUsd: toNumber(row.cost),
    inputTokens: toNumber(row.prompt_tokens),
    outputTokens: toNumber(row.completion_tokens),
    model: model?.trim() || undefined,
  };
}

async function readCrushDb(dbPath: string, sinceMs: number): Promise<LocalUsageRecord[]> {
  return withReadOnlySqlite(dbPath, (db) => {
    if (!sqliteTableNames(db).has("sessions")) return [];
    const cols = sqliteColumnNames(db, "sessions");
    // Sub-agent sessions roll their cost into the parent; count top-level sessions only.
    const where = cols.has("parent_session_id") ? "WHERE parent_session_id IS NULL" : "";
    const rows = db
      .prepare(`SELECT id, prompt_tokens, completion_tokens, cost, created_at, updated_at FROM sessions ${where}`)
      .all() as Array<Record<string, unknown>>;

    const models = new Map<string, string>();
    if (sqliteColumnNames(db, "messages").has("model")) {
      const modelRows = db
        .prepare(
          `SELECT session_id, model, COUNT(*) AS n FROM messages
           WHERE model IS NOT NULL AND model != '' GROUP BY session_id, model ORDER BY n ASC`,
        )
        .all() as Array<{ session_id?: unknown; model?: unknown }>;
      // Ascending order: the most frequent model per session is written last.
      for (const r of modelRows) models.set(String(r.session_id), String(r.model));
    }

    const out: LocalUsageRecord[] = [];
    for (const row of rows) {
      const rec = parseCrushSession(row, models.get(String(row["id"])));
      if (rec && rec.timestampMs >= sinceMs) out.push(rec);
    }
    return out;
  });
}

/** Read Crush usage from every project database listed in the global projects.json. */
export async function fetchCrushUsage(days: number): Promise<LocalUsageResult> {
  const registry = join(crushGlobalDataDir(), "projects.json");
  if (!existsSync(registry)) {
    throw new LocalUsageNotFoundError(`Crush projects.json not found at ${registry}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(registry, "utf-8"));
  } catch (err: unknown) {
    throw new Error(`Could not read Crush projects.json: ${(err as Error).message}`);
  }
  const dbPaths = parseCrushProjects(parsed).filter((p) => existsSync(p));
  if (dbPaths.length === 0) throw new LocalUsageNotFoundError("No Crush project databases found");

  const signature = [fileSignature(registry), ...dbPaths.map(fileSignature)].join("||");
  return cachedLocalRead(`crush:${String(days)}`, signature, async () => {
    const sinceMs = windowStartMs(days);
    const records: LocalUsageRecord[] = [];
    let firstError: Error | null = null;
    let readable = 0;
    for (const dbPath of dbPaths) {
      try {
        records.push(...(await readCrushDb(dbPath, sinceMs)));
        readable++;
      } catch (err: unknown) {
        firstError ??= err as Error;
      }
    }
    if (readable === 0 && firstError) throw firstError;
    return summarizeLocalUsage(records, days);
  });
}

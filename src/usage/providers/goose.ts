import { existsSync } from "node:fs";
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
  parseTimestampMs,
  summarizeLocalUsage,
  toNumber,
  windowStartMs,
} from "./local-usage.js";

/**
 * Candidate locations of Goose's `sessions/sessions.db`, most specific first.
 * Upstream resolves `Paths::data_dir()` as `$GOOSE_PATH_ROOT/data` when set, otherwise the
 * etcetera app strategy (XDG on Linux/macOS, `%APPDATA%\Block\goose\data` on Windows).
 */
export function gooseSessionDbCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string[] {
  const dataDirs: string[] = [];
  const root = env["GOOSE_PATH_ROOT"]?.trim();
  if (root && isAbsolute(root)) dataDirs.push(join(root, "data"));
  if (platform === "win32") {
    const appData = env["APPDATA"]?.trim() || join(home, "AppData", "Roaming");
    dataDirs.push(join(appData, "Block", "goose", "data"), join(appData, "Block", "goose"));
  } else {
    const xdg = env["XDG_DATA_HOME"]?.trim();
    dataDirs.push(join(xdg || join(home, ".local", "share"), "goose"));
    if (platform === "darwin") dataDirs.push(join(home, "Library", "Application Support", "Block", "goose"));
  }
  return dataDirs.map((d) => join(d, "sessions", "sessions.db"));
}

/** Model name from `sessions.model_config_json` (a serialized Goose ModelConfig). */
export function gooseModelFromConfig(json: unknown): string | undefined {
  if (typeof json !== "string" || !json.trim()) return undefined;
  try {
    const parsed = JSON.parse(json) as { model_name?: unknown };
    return typeof parsed.model_name === "string" && parsed.model_name.trim() ? parsed.model_name.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse one `usage_ledger` row (schema v15+): one recorded usage event with its own
 * timestamp, model and cost. `input_tokens` already includes cached input as reported
 * by the provider, so cache columns are not added again.
 */
export function parseGooseLedgerRow(row: {
  created_timestamp?: unknown;
  model?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  cost?: unknown;
}): LocalUsageRecord | null {
  const timestampMs = epochToMs(row.created_timestamp);
  if (!timestampMs) return null;
  return {
    timestampMs,
    costUsd: toNumber(row.cost),
    inputTokens: toNumber(row.input_tokens),
    outputTokens: toNumber(row.output_tokens),
    model: typeof row.model === "string" && row.model.trim() ? row.model.trim() : undefined,
  };
}

/**
 * Parse one `sessions` row for databases without a usage ledger: session-level accumulated
 * totals attributed to the session's last update. `accumulated_cost` exists from schema v13.
 */
export function parseGooseSessionRow(row: {
  accumulated_input_tokens?: unknown;
  accumulated_output_tokens?: unknown;
  accumulated_cost?: unknown;
  model_config_json?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): LocalUsageRecord | null {
  const timestampMs = parseTimestampMs(row.updated_at) || parseTimestampMs(row.created_at);
  if (!timestampMs) return null;
  return {
    timestampMs,
    costUsd: toNumber(row.accumulated_cost),
    inputTokens: toNumber(row.accumulated_input_tokens),
    outputTokens: toNumber(row.accumulated_output_tokens),
    model: gooseModelFromConfig(row.model_config_json),
  };
}

async function readGooseDb(dbPath: string, sinceMs: number): Promise<LocalUsageRecord[]> {
  return withReadOnlySqlite(dbPath, (db) => {
    const tables = sqliteTableNames(db);
    const out: LocalUsageRecord[] = [];

    if (tables.has("usage_ledger")) {
      const cols = sqliteColumnNames(db, "usage_ledger");
      const pick = (c: string) => (cols.has(c) ? c : `NULL AS ${c}`);
      // created_timestamp may be seconds or ms; the seconds bound keeps every ms row too.
      const rows = db
        .prepare(
          `SELECT created_timestamp, ${pick("model")}, ${pick("input_tokens")}, ${pick("output_tokens")}, ${pick("cost")}
           FROM usage_ledger WHERE created_timestamp >= ?`,
        )
        .all(Math.floor(sinceMs / 1000)) as Array<Record<string, unknown>>;
      if (rows.length > 0 || db.prepare("SELECT 1 FROM usage_ledger LIMIT 1").get()) {
        for (const row of rows) {
          const rec = parseGooseLedgerRow(row);
          if (rec && rec.timestampMs >= sinceMs) out.push(rec);
        }
        return out;
      }
    }

    if (!tables.has("sessions")) return out;
    const cols = sqliteColumnNames(db, "sessions");
    if (!cols.has("accumulated_input_tokens")) return out;
    const pick = (c: string) => (cols.has(c) ? c : `NULL AS ${c}`);
    const rows = db
      .prepare(
        `SELECT accumulated_input_tokens, ${pick("accumulated_output_tokens")}, ${pick("accumulated_cost")},
                ${pick("model_config_json")}, ${pick("created_at")}, ${pick("updated_at")}
         FROM sessions`,
      )
      .all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const rec = parseGooseSessionRow(row);
      if (rec && rec.timestampMs >= sinceMs) out.push(rec);
    }
    return out;
  });
}

/** Read Goose usage from its SQLite session store (usage ledger, falling back to session totals). */
export async function fetchGooseUsage(days: number): Promise<LocalUsageResult> {
  const dbPath = gooseSessionDbCandidates().find((p) => existsSync(p));
  if (!dbPath) throw new LocalUsageNotFoundError("Goose sessions.db not found");
  return cachedLocalRead(`goose:${dbPath}:${String(days)}`, fileSignature(dbPath), async () =>
    summarizeLocalUsage(await readGooseDb(dbPath, windowStartMs(days)), days),
  );
}

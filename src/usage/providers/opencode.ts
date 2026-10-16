import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

/** Legacy JSON storage can hold many files; cap the scan so a refresh stays fast. */
const LEGACY_MAX_FILES = 20_000;

/**
 * OpenCode data dir: `$XDG_DATA_HOME/opencode`, else `~/.local/share/opencode`
 * (OpenCode uses xdg-basedir on every platform, including Windows).
 */
export function opencodeDataDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const xdg = env["XDG_DATA_HOME"]?.trim();
  return join(xdg || join(home, ".local", "share"), "opencode");
}

/**
 * Parse one OpenCode message record (`message.data` in opencode.db, or a legacy
 * `storage/message/<session>/<id>.json` file). Only assistant messages carry usage.
 *
 * Input tokens include cache reads/writes, matching how the Claude Admin API provider counts input.
 */
export function parseOpencodeMessage(data: unknown, fallbackMs = 0): LocalUsageRecord | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as {
    role?: unknown;
    cost?: unknown;
    modelID?: unknown;
    providerID?: unknown;
    time?: { created?: unknown; completed?: unknown };
    tokens?: {
      input?: unknown;
      output?: unknown;
      reasoning?: unknown;
      cache?: { read?: unknown; write?: unknown };
    };
  };
  if (msg.role !== "assistant") return null;

  const tokens = msg.tokens ?? {};
  const inputTokens = toNumber(tokens.input) + toNumber(tokens.cache?.read) + toNumber(tokens.cache?.write);
  const outputTokens = toNumber(tokens.output) + toNumber(tokens.reasoning);
  const costUsd = toNumber(msg.cost);
  const timestampMs = epochToMs(msg.time?.created) || epochToMs(msg.time?.completed) || fallbackMs;
  if (!timestampMs) return null;

  const model = typeof msg.modelID === "string" && msg.modelID.trim() ? msg.modelID.trim() : undefined;
  return { timestampMs, costUsd, inputTokens, outputTokens, model };
}

function parseJsonText(text: unknown): unknown {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readOpencodeDb(dbPath: string, sinceMs: number): Promise<LocalUsageRecord[]> {
  return withReadOnlySqlite(dbPath, (db) => {
    if (!sqliteTableNames(db).has("message")) return [];
    const cols = sqliteColumnNames(db, "message");
    if (!cols.has("data")) return [];
    const hasTime = cols.has("time_created");
    const rows = (
      hasTime
        ? db.prepare("SELECT data, time_created FROM message WHERE time_created >= ?").all(sinceMs)
        : db.prepare("SELECT data FROM message").all()
    ) as Array<{ data?: unknown; time_created?: unknown }>;
    const out: LocalUsageRecord[] = [];
    for (const row of rows) {
      const rec = parseOpencodeMessage(parseJsonText(row.data), epochToMs(row.time_created));
      if (rec) out.push(rec);
    }
    return out;
  });
}

function readOpencodeLegacy(messageDir: string, sinceMs: number): LocalUsageRecord[] {
  const out: LocalUsageRecord[] = [];
  let scanned = 0;
  for (const session of readdirSync(messageDir, { withFileTypes: true })) {
    if (!session.isDirectory()) continue;
    const sessionDir = join(messageDir, session.name);
    let files: string[];
    try {
      files = readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of files) {
      if (++scanned > LEGACY_MAX_FILES) return out;
      const path = join(sessionDir, file);
      try {
        const st = statSync(path);
        if (st.mtimeMs < sinceMs) continue;
        const rec = parseOpencodeMessage(parseJsonText(readFileSync(path, "utf-8")), st.mtimeMs);
        if (rec) out.push(rec);
      } catch {
        /* skip unreadable / partially written files */
      }
    }
  }
  return out;
}

/** Read OpenCode usage from opencode.db (current releases) or legacy JSON message storage. */
export async function fetchOpencodeUsage(days: number): Promise<LocalUsageResult> {
  const dir = opencodeDataDir();
  const dbPath = join(dir, "opencode.db");
  const legacyDir = join(dir, "storage", "message");
  const sinceMs = windowStartMs(days);

  if (existsSync(dbPath)) {
    return cachedLocalRead(`opencode:${dbPath}:${String(days)}`, fileSignature(dbPath), async () =>
      summarizeLocalUsage(await readOpencodeDb(dbPath, sinceMs), days),
    );
  }
  if (existsSync(legacyDir)) {
    return cachedLocalRead(`opencode:${legacyDir}:${String(days)}`, fileSignature(legacyDir), () =>
      Promise.resolve(summarizeLocalUsage(readOpencodeLegacy(legacyDir, sinceMs), days)),
    );
  }
  throw new LocalUsageNotFoundError(`OpenCode data not found under ${dir}`);
}

import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * PTY log retention / garbage collection.
 *
 * Kept free of Electron imports so the selection logic can be unit-tested
 * with plain Node (`node --test`).
 */

export type PtyLogRetentionPrefs = {
  /** Delete logs whose last write is older than this many days (0 = no age limit). */
  maxAgeDays: number;
  /** Keep the pty-logs folder under this many MB (0 = no size limit). */
  maxTotalMb: number;
  /** Keep at most this many logs per tool / profile (0 = no count limit). */
  maxFilesPerTool: number;
};

export const DEFAULT_PTY_LOG_RETENTION: PtyLogRetentionPrefs = {
  maxAgeDays: 14,
  maxTotalMb: 200,
  maxFilesPerTool: 50,
};

export const PTY_LOG_RETENTION_LIMITS = {
  maxAgeDays: { min: 0, max: 3650 },
  maxTotalMb: { min: 0, max: 100 * 1024 },
  maxFilesPerTool: { min: 0, max: 10_000 },
} as const;

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function normalizePtyLogRetention(
  raw: Partial<Record<keyof PtyLogRetentionPrefs, unknown>> | null | undefined,
): PtyLogRetentionPrefs {
  const src = raw ?? {};
  const out = { ...DEFAULT_PTY_LOG_RETENTION };
  for (const key of Object.keys(PTY_LOG_RETENTION_LIMITS) as (keyof PtyLogRetentionPrefs)[]) {
    if (src[key] === undefined) continue;
    const { min, max } = PTY_LOG_RETENTION_LIMITS[key];
    out[key] = clampInt(src[key], min, max, DEFAULT_PTY_LOG_RETENTION[key]);
  }
  return out;
}

export type PtyLogFileInfo = {
  /** File name inside the pty-logs dir, e.g. `claude-1712345678901-abcd1234.log`. */
  name: string;
  size: number;
  mtimeMs: number;
};

const SESSION_ID_RE = /^(.+)-\d+-[0-9a-f]{8}$/i;

/** `<sessionId>.log` → sessionId, or null for non-log files. */
export function ptyLogSessionId(fileName: string): string | null {
  return fileName.endsWith(".log") ? fileName.slice(0, -".log".length) : null;
}

/** Session ids are `<tool>-<epochMs>-<uuid8>`; group logs by the tool prefix. */
export function ptyLogGroupKey(sessionId: string): string {
  const m = SESSION_ID_RE.exec(sessionId);
  return m ? m[1]! : sessionId;
}

/**
 * Pure selection: which log files should be deleted under `prefs`.
 *
 * Order of rules: age → per-tool count → total size (oldest first).
 * Logs of protected sessions (live PTYs / panes still holding the buffer)
 * are never selected, but still count toward the count and size budgets.
 */
export function selectPtyLogsToDelete(
  files: readonly PtyLogFileInfo[],
  prefs: PtyLogRetentionPrefs,
  opts: { now: number; protectedSessionIds: ReadonlySet<string> },
): string[] {
  const logs = files
    .map((f) => ({ ...f, sessionId: ptyLogSessionId(f.name) }))
    .filter((f): f is PtyLogFileInfo & { sessionId: string } => f.sessionId !== null);
  const isProtected = (f: { sessionId: string }) => opts.protectedSessionIds.has(f.sessionId);
  const doomed = new Set<string>();

  if (prefs.maxAgeDays > 0) {
    const cutoff = opts.now - prefs.maxAgeDays * 24 * 60 * 60 * 1000;
    for (const f of logs) {
      if (!isProtected(f) && f.mtimeMs < cutoff) doomed.add(f.name);
    }
  }

  // Newest first so "keep the first N" reads naturally.
  const byNewest = (a: PtyLogFileInfo, b: PtyLogFileInfo) =>
    b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name);

  if (prefs.maxFilesPerTool > 0) {
    const groups = new Map<string, (typeof logs)[number][]>();
    for (const f of logs) {
      if (doomed.has(f.name)) continue;
      const key = ptyLogGroupKey(f.sessionId);
      const list = groups.get(key);
      if (list) list.push(f);
      else groups.set(key, [f]);
    }
    for (const list of groups.values()) {
      list.sort(byNewest);
      let kept = 0;
      for (const f of list) {
        if (isProtected(f) || kept < prefs.maxFilesPerTool) {
          kept++;
          continue;
        }
        doomed.add(f.name);
      }
    }
  }

  if (prefs.maxTotalMb > 0) {
    const budget = prefs.maxTotalMb * 1024 * 1024;
    const remaining = logs.filter((f) => !doomed.has(f.name)).sort(byNewest);
    let total = remaining.reduce((sum, f) => sum + f.size, 0);
    for (let i = remaining.length - 1; i >= 0 && total > budget; i--) {
      const f = remaining[i]!;
      if (isProtected(f)) continue;
      doomed.add(f.name);
      total -= f.size;
    }
  }

  return logs.filter((f) => doomed.has(f.name)).map((f) => f.name);
}

export async function scanPtyLogDir(dir: string): Promise<PtyLogFileInfo[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: PtyLogFileInfo[] = [];
  for (const name of names) {
    if (!name.endsWith(".log")) continue;
    try {
      const st = await stat(join(dir, name));
      if (st.isFile()) out.push({ name, size: st.size, mtimeMs: st.mtimeMs });
    } catch {
      /* raced with a delete */
    }
  }
  return out;
}

export type PtyLogGcResult = {
  scanned: number;
  deleted: number;
  freedBytes: number;
};

/** Scan `dir`, apply retention, and unlink selected files (best-effort). */
export async function runPtyLogGc(
  dir: string,
  prefs: PtyLogRetentionPrefs,
  opts: { now?: number; protectedSessionIds: ReadonlySet<string> },
): Promise<PtyLogGcResult> {
  const files = await scanPtyLogDir(dir);
  const victims = selectPtyLogsToDelete(files, prefs, {
    now: opts.now ?? Date.now(),
    protectedSessionIds: opts.protectedSessionIds,
  });
  const sizes = new Map(files.map((f) => [f.name, f.size]));
  let deleted = 0;
  let freedBytes = 0;
  for (const name of victims) {
    try {
      await unlink(join(dir, name));
      deleted++;
      freedBytes += sizes.get(name) ?? 0;
    } catch {
      /* in use or already gone */
    }
  }
  return { scanned: files.length, deleted, freedBytes };
}

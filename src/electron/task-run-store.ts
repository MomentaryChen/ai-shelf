/**
 * Task run history (main process). Each run started from Tasks gets
 * `<appData>/tasks/runs/<taskId>/<runId>.json` (the record) and `<runId>.log` (raw terminal
 * output, capped). The output is recorded here, not taken from the pane's buffer or
 * pty-logs: both are cleared when the pane closes, which is how most runs end.
 *
 * Kept local only: backup and sync never read `tasks/runs` (terminal output can hold secrets).
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  type WriteStream,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isSafeTaskId } from "../shared/task-file.js";
import {
  isSafeTaskRunId,
  newTaskRunId,
  type TaskRunOutput,
  type TaskRunRecord,
  type TaskRunStart,
  type TaskRunStatus,
} from "../shared/task-run-types.js";
import {
  extractClaudeConversation,
  summarizeClaudeTranscriptUsage,
} from "../shared/claude-transcript-usage.js";
import { findClaudeTranscript } from "./agent-session.js";
import { getTasksDir } from "./task-service.js";

/** Runs kept per task; older ones are deleted when a new run starts. */
const MAX_RUNS_PER_TASK = 50;
/** Terminal output recorded per run; later output is dropped. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_VARIABLE_CHARS = 20_000;
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

/** Stored with the record but never sent to the renderer. */
interface StoredRun extends TaskRunRecord {
  claudeConfigDir?: string;
}

interface ActiveRun {
  record: StoredRun;
  log: WriteStream | null;
}

/** Live runs by PTY session id. */
const ACTIVE = new Map<string, ActiveRun>();

function runsDir(taskId: string): string {
  return join(getTasksDir(), "runs", taskId);
}

function recordPath(taskId: string, runId: string): string {
  return join(runsDir(taskId), `${runId}.json`);
}

function logPath(taskId: string, runId: string): string {
  return join(runsDir(taskId), `${runId}.log`);
}

function writeRecord(record: StoredRun): void {
  try {
    mkdirSync(runsDir(record.taskId), { recursive: true });
    writeFileSync(recordPath(record.taskId, record.id), JSON.stringify(record, null, 2), "utf8");
  } catch (err) {
    console.warn("[task-runs] could not write run record:", err);
  }
}

function readRecord(taskId: string, runId: string): StoredRun | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(recordPath(taskId, runId), "utf8"));
    if (!raw || typeof raw !== "object") return null;
    const rec = raw as StoredRun;
    if (rec.id !== runId || rec.taskId !== taskId) return null;
    return rec;
  } catch {
    return null;
  }
}

function publicRecord(rec: StoredRun): TaskRunRecord {
  const { claudeConfigDir: _dir, ...rest } = rec;
  return rest;
}

function sanitizeVariables(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,39}$/.test(k) || typeof v !== "string") continue;
    out[k] = v.slice(0, MAX_VARIABLE_CHARS);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Validates the renderer's `taskRun` spawn option. */
export function parseTaskRunStart(input: unknown): TaskRunStart | null {
  if (!input || typeof input !== "object") return null;
  const { taskId, taskName, variables } = input as Record<string, unknown>;
  if (typeof taskId !== "string" || !isSafeTaskId(taskId.trim())) return null;
  const name = typeof taskName === "string" && taskName.trim() ? taskName.trim() : taskId.trim();
  const vars = sanitizeVariables(variables);
  return {
    taskId: taskId.trim(),
    taskName: name.slice(0, 200),
    ...(vars ? { variables: vars } : {}),
  };
}

function pruneOldRuns(taskId: string): void {
  let ids: string[];
  try {
    ids = readdirSync(runsDir(taskId))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter(isSafeTaskRunId)
      .sort();
  } catch {
    return;
  }
  const live = new Set([...ACTIVE.values()].map((a) => a.record.id));
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_RUNS_PER_TASK))) {
    if (live.has(id)) continue;
    for (const file of [recordPath(taskId, id), logPath(taskId, id)]) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  }
}

export function startTaskRun(
  sessionId: string,
  start: TaskRunStart,
  info: {
    tool: string;
    cwd: string;
    prompt: string;
    cols: number;
    rows: number;
    agentSessionId?: string;
    claudeConfigDir?: string;
  },
): void {
  const record: StoredRun = {
    id: newTaskRunId(),
    taskId: start.taskId,
    taskName: start.taskName,
    tool: info.tool,
    cwd: info.cwd,
    prompt: info.prompt,
    ...(start.variables ? { variables: start.variables } : {}),
    startedAt: new Date().toISOString(),
    status: "running",
    cols: info.cols,
    rows: info.rows,
    outputBytes: 0,
    ...(info.agentSessionId ? { agentSessionId: info.agentSessionId } : {}),
    ...(info.agentSessionId && info.claudeConfigDir
      ? { claudeConfigDir: info.claudeConfigDir }
      : {}),
  };
  writeRecord(record);
  let log: WriteStream | null = null;
  try {
    log = createWriteStream(logPath(record.taskId, record.id), { flags: "a" });
    log.on("error", (err) => console.warn("[task-runs] log write failed:", err));
  } catch (err) {
    console.warn("[task-runs] could not open run log:", err);
  }
  ACTIVE.set(sessionId, { record, log });
  pruneOldRuns(record.taskId);
}

export function appendTaskRunOutput(sessionId: string, data: string): void {
  const run = ACTIVE.get(sessionId);
  if (!run?.log || run.record.outputTruncated) return;
  const bytes = Buffer.byteLength(data, "utf8");
  if (run.record.outputBytes + bytes > MAX_OUTPUT_BYTES) {
    run.record.outputTruncated = true;
    return;
  }
  run.record.outputBytes += bytes;
  run.log.write(data);
}

export function resizeTaskRun(sessionId: string, cols: number, rows: number): void {
  const run = ACTIVE.get(sessionId);
  if (!run) return;
  run.record.cols = cols;
  run.record.rows = rows;
}

export function markTaskRunPromptNotSent(sessionId: string): void {
  const run = ACTIVE.get(sessionId);
  if (!run) return;
  run.record.status = "prompt-not-sent";
  writeRecord(run.record);
}

async function readTranscript(rec: StoredRun): Promise<string | null> {
  if (!rec.agentSessionId || !rec.claudeConfigDir) return null;
  const file = findClaudeTranscript(rec.claudeConfigDir, rec.cwd, rec.agentSessionId);
  if (!file) return null;
  try {
    const text = await readFile(file, "utf8");
    return text.length > MAX_TRANSCRIPT_BYTES ? text.slice(-MAX_TRANSCRIPT_BYTES) : text;
  } catch {
    return null;
  }
}

async function refreshUsage(rec: StoredRun): Promise<boolean> {
  const transcript = await readTranscript(rec);
  if (transcript === null) return false;
  const usage = summarizeClaudeTranscriptUsage(transcript);
  if (!usage) return false;
  rec.usage = usage;
  return true;
}

/**
 * The run's terminal ended. Idempotent: closing a pane reports first (`closed`), node-pty's
 * own exit arrives later and is ignored.
 */
export function finishTaskRun(
  sessionId: string,
  exitCode: number,
  how: "exited" | "closed" | "interrupted",
): void {
  const run = ACTIVE.get(sessionId);
  if (!run) return;
  ACTIVE.delete(sessionId);
  const rec = run.record;
  rec.endedAt = new Date().toISOString();
  rec.exitCode = exitCode;
  // A prompt that never went out stays visible as the run's outcome.
  if (rec.status !== "prompt-not-sent") rec.status = how;
  try {
    run.log?.end();
  } catch {
    /* ignore */
  }
  writeRecord(rec);
  if (how === "interrupted") return;
  void refreshUsage(rec)
    .then((changed) => {
      if (changed) writeRecord(rec);
    })
    .catch(() => undefined);
}

/** App shutdown: close every open run synchronously (PTY exit events may never arrive). */
export function interruptAllTaskRuns(): void {
  for (const sessionId of [...ACTIVE.keys()]) finishTaskRun(sessionId, -1, "interrupted");
}

function listRecordIds(taskId: string): string[] {
  try {
    return readdirSync(runsDir(taskId))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter(isSafeTaskRunId);
  } catch {
    return [];
  }
}

function liveRecord(taskId: string, runId: string): StoredRun | undefined {
  for (const run of ACTIVE.values()) {
    if (run.record.taskId === taskId && run.record.id === runId) return run.record;
  }
  return undefined;
}

/** Newest first. Usage of open runs is re-read from their transcript. */
export async function listTaskRuns(taskId: string): Promise<TaskRunRecord[]> {
  if (!isSafeTaskId(taskId)) return [];
  const out: StoredRun[] = [];
  for (const id of listRecordIds(taskId)) {
    const rec = liveRecord(taskId, id) ?? readRecord(taskId, id);
    if (rec) out.push(rec);
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  await Promise.all(
    out
      .filter((r) => r.status === "running" || r.status === "prompt-not-sent" || !r.usage)
      .filter((r) => r.agentSessionId)
      .map(async (r) => {
        const live = liveRecord(taskId, r.id) !== undefined;
        if ((await refreshUsage(r)) && !live) writeRecord(r);
      }),
  );
  return out.map(publicRecord);
}

/** Latest run per task (for card badges). */
export function latestTaskRuns(): Record<string, TaskRunRecord> {
  const out: Record<string, TaskRunRecord> = {};
  let taskIds: string[];
  try {
    taskIds = readdirSync(join(getTasksDir(), "runs")).filter(isSafeTaskId);
  } catch {
    return out;
  }
  for (const taskId of taskIds) {
    const ids = listRecordIds(taskId).sort();
    for (let i = ids.length - 1; i >= 0; i--) {
      const rec = liveRecord(taskId, ids[i]!) ?? readRecord(taskId, ids[i]!);
      if (rec) {
        out[taskId] = publicRecord(rec);
        break;
      }
    }
  }
  return out;
}

export async function readTaskRunOutput(
  taskId: string,
  runId: string,
): Promise<TaskRunOutput | null> {
  if (!isSafeTaskId(taskId) || !isSafeTaskRunId(runId)) return null;
  const rec = liveRecord(taskId, runId) ?? readRecord(taskId, runId);
  if (!rec) return null;
  let terminal = "";
  try {
    terminal = await readFile(logPath(taskId, runId), "utf8");
  } catch {
    /* no output recorded */
  }
  const transcript = await readTranscript(rec);
  const conversation = transcript ? extractClaudeConversation(transcript) : undefined;
  return { terminal, ...(conversation?.length ? { conversation } : {}) };
}

export function deleteTaskRun(taskId: string, runId: string): { ok: boolean; error?: string } {
  if (!isSafeTaskId(taskId) || !isSafeTaskRunId(runId)) return { ok: false, error: "invalid-id" };
  if (liveRecord(taskId, runId)) return { ok: false, error: "running" };
  try {
    for (const file of [recordPath(taskId, runId), logPath(taskId, runId)]) {
      if (existsSync(file)) unlinkSync(file);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Every finished run of a task (open runs are kept). */
export function clearTaskRuns(taskId: string): { ok: boolean; error?: string } {
  if (!isSafeTaskId(taskId)) return { ok: false, error: "invalid-id" };
  for (const id of listRecordIds(taskId)) {
    if (liveRecord(taskId, id)) continue;
    const res = deleteTaskRun(taskId, id);
    if (!res.ok) return res;
  }
  if (![...ACTIVE.values()].some((a) => a.record.taskId === taskId)) {
    try {
      rmSync(runsDir(taskId), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

/** Runs left `running` by a crash or a kill: mark them interrupted. */
export function initTaskRunStore(): void {
  let taskIds: string[];
  try {
    taskIds = readdirSync(join(getTasksDir(), "runs")).filter(isSafeTaskId);
  } catch {
    return;
  }
  for (const taskId of taskIds) {
    for (const id of listRecordIds(taskId)) {
      const rec = readRecord(taskId, id);
      if (!rec || rec.status === "interrupted" || rec.exitCode !== undefined) continue;
      // The end time is unknown; the record keeps no `endedAt`.
      const stale: TaskRunStatus = rec.status === "prompt-not-sent" ? rec.status : "interrupted";
      rec.status = stale;
      rec.exitCode = -1;
      writeRecord(rec);
    }
  }
}

/**
 * Task run history: one record per task run, kept under `<appData>/tasks/runs/<taskId>/`.
 *
 * A task runs an interactive agent session, so a run "ends" when its terminal process
 * exits — the agent quitting, the user closing the pane, or the app shutting down.
 */

/**
 * - `running`: the terminal is still open.
 * - `exited`: the process ended on its own (see `exitCode`).
 * - `closed`: the user closed the terminal.
 * - `interrupted`: the app quit or crashed while the run was open.
 * - `prompt-not-sent`: the agent never left a start-up dialog, so the prompt was not typed.
 *   The terminal may still be open; the record stays in this state until it closes.
 */
export type TaskRunStatus = "running" | "exited" | "closed" | "interrupted" | "prompt-not-sent";

export interface TaskRunUsage {
  /** Model of the last assistant message (a session can switch models). */
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Estimated USD from list prices; absent when a model's price is unknown. */
  costUsd?: number;
  /** Assistant messages counted. */
  messages: number;
}

export interface TaskRunRecord {
  /** Sortable id: `<epoch-ms base36>-<random>`. */
  id: string;
  taskId: string;
  taskName: string;
  tool: string;
  cwd: string;
  /** The prompt as sent, variables filled. */
  prompt: string;
  /** Values the run form filled in, by variable name. */
  variables?: Record<string, string>;
  startedAt: string;
  endedAt?: string;
  status: TaskRunStatus;
  /** Process exit code when the run ended (-1 = killed). */
  exitCode?: number;
  /** Claude Code conversation id, when the tool supports it; used for usage and the conversation view. */
  agentSessionId?: string;
  /** Last terminal size, for replaying the recorded output. */
  cols: number;
  rows: number;
  /** Bytes of terminal output recorded; the log stops at the size cap. */
  outputBytes: number;
  outputTruncated?: boolean;
  usage?: TaskRunUsage;
}

/** What the renderer passes to `pty-spawn` so main records the run. */
export interface TaskRunStart {
  taskId: string;
  taskName: string;
  variables?: Record<string, string>;
}

/** One message of an agent conversation, for the run detail view. */
export interface TaskRunMessage {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
}

export interface TaskRunOutput {
  /** Raw terminal output (ANSI included). */
  terminal: string;
  /** User / assistant text from the Claude transcript, when one is found. */
  conversation?: TaskRunMessage[];
}

const RUN_ID_RE = /^[a-z0-9]{6,12}-[a-z0-9]{4,12}$/;

export function isSafeTaskRunId(id: unknown): id is string {
  return typeof id === "string" && RUN_ID_RE.test(id);
}

export function newTaskRunId(now = Date.now(), random = Math.random): string {
  const rand = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, "0");
  return `${now.toString(36)}-${rand}`;
}

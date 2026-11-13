/**
 * Tasks: saved prompts that open a terminal pane in a profile and send the prompt to
 * the agent CLI (interactive session, not `-p`). Stored as `<appData>/tasks/<id>.task.md`.
 */
export interface TaskDef {
  /** File-safe id (filename without `.task.md`). */
  id: string;
  name: string;
  description?: string;
  /** Profile id (or name, for hand-written files) to run in; empty = the active profile. */
  profileId?: string;
  /** Agent tool override (`claude`, `codex`, …); empty = the profile's default tool. */
  tool?: string;
  /** Sent to the agent as the first message. */
  prompt: string;
  /** ISO timestamp of the file's last write. */
  updatedAt?: string;
}

/** Fields the editor sends; no `id` creates a new task. */
export type TaskInput = Omit<TaskDef, "id" | "updatedAt"> & { id?: string };

export type TaskSaveResult = { ok: true; task: TaskDef } | { ok: false; error: string };

export interface RunTaskRequest {
  /** The task's id. A task that already has a live terminal is shown, not started again. */
  taskId?: string;
  prompt: string;
  profileId?: string;
  tool?: string;
}

export type RunTaskResult =
  | { ok: true }
  | { ok: false; reason: "profile-not-found" | "no-agent-tool" | "spawn-failed" | "busy" };

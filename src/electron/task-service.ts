import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import {
  TASK_FILE_SUFFIX,
  allocateTaskId,
  isSafeTaskId,
  parseTaskFile,
  serializeTaskFile,
  taskFromLegacyFlow,
} from "../shared/task-file.js";
import type { TaskDef, TaskInput, TaskSaveResult } from "../shared/task-types.js";
import { getOsSchedulerBackend, type OsJobSpec } from "./os-scheduler.js";

/** Written once legacy `flows/*.flow.md` have been converted; the flows are left in place. */
const MIGRATION_MARKER = ".migrated-from-flows";

export function getTasksDir(): string {
  return join(getAppDataDir(), "tasks");
}

function taskPath(id: string): string {
  return join(getTasksDir(), `${id}${TASK_FILE_SUFFIX}`);
}

function readTask(fileName: string): TaskDef | null {
  const id = fileName.slice(0, -TASK_FILE_SUFFIX.length);
  if (!isSafeTaskId(id)) return null;
  const filePath = join(getTasksDir(), fileName);
  try {
    const task = parseTaskFile(readFileSync(filePath, "utf8"), id);
    // The file name is the identity; a hand-edited frontmatter id must not alias another file.
    task.id = id;
    task.updatedAt = statSync(filePath).mtime.toISOString();
    return task;
  } catch {
    return null;
  }
}

export function listTasks(): TaskDef[] {
  const dir = getTasksDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(TASK_FILE_SUFFIX))
    .map(readTask)
    .filter((t): t is TaskDef => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function takenIds(): Set<string> {
  return new Set(listTasks().map((t) => t.id));
}

export function saveTask(input: TaskInput): TaskSaveResult {
  const name = input.name?.trim() ?? "";
  const prompt = input.prompt?.trim() ?? "";
  if (!name) return { ok: false, error: "name-required" };
  if (!prompt) return { ok: false, error: "prompt-required" };

  let id = input.id?.trim();
  if (id) {
    if (!isSafeTaskId(id)) return { ok: false, error: "invalid-id" };
    if (!existsSync(taskPath(id))) return { ok: false, error: "not-found" };
  } else {
    id = allocateTaskId(name, takenIds());
  }

  try {
    mkdirSync(getTasksDir(), { recursive: true });
    writeFileSync(
      taskPath(id),
      serializeTaskFile({
        id,
        name,
        prompt,
        description: input.description,
        profileId: input.profileId,
        tool: input.tool,
      }),
      "utf8",
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const saved = readTask(`${id}${TASK_FILE_SUFFIX}`);
  return saved ? { ok: true, task: saved } : { ok: false, error: "write-failed" };
}

export function deleteTask(id: string): { ok: boolean; error?: string } {
  if (!isSafeTaskId(id)) return { ok: false, error: "invalid-id" };
  try {
    if (existsSync(taskPath(id))) unlinkSync(taskPath(id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Convert legacy AI Flows into tasks, once. Never deletes `flows/` or `runs/`. */
function migrateLegacyFlows(): void {
  const dir = getTasksDir();
  const marker = join(dir, MIGRATION_MARKER);
  if (existsSync(marker)) return;
  mkdirSync(dir, { recursive: true });

  const flowsDir = join(getAppDataDir(), "flows");
  let converted = 0;
  if (existsSync(flowsDir)) {
    const taken = takenIds();
    for (const fileName of readdirSync(flowsDir)) {
      if (!fileName.endsWith(".flow.md")) continue;
      try {
        const fallbackId = fileName.slice(0, -".flow.md".length);
        const task = taskFromLegacyFlow(
          readFileSync(join(flowsDir, fileName), "utf8"),
          isSafeTaskId(fallbackId) ? fallbackId : "flow",
        );
        if (!task) continue;
        if (taken.has(task.id)) task.id = allocateTaskId(task.id, taken);
        taken.add(task.id);
        writeFileSync(taskPath(task.id), serializeTaskFile(task), "utf8");
        converted++;
      } catch (err) {
        console.warn("[tasks] could not convert flow", fileName, err);
      }
    }
  }
  writeFileSync(marker, `${new Date().toISOString()} converted=${converted}\n`, "utf8");
}

/** The every-minute `flow due` OS job AI Flow could install; its CLI no longer exists. */
const LEGACY_FLOW_DUE_JOB: OsJobSpec = {
  description: "AI Shelf — run due AI Flows",
  names: {
    windowsTaskName: "AI Shelf Flow Due",
    launchdLabel: "com.ai-shelf.flow-due",
    systemdUnit: "ai-shelf-flow-due",
  },
  program: "",
  args: [],
  schedule: { kind: "interval", minutes: 1 },
};

async function removeLegacyFlowDueJob(): Promise<void> {
  const backend = getOsSchedulerBackend();
  if (!backend) return;
  if (await backend.unavailableReason()) return;
  if (!(await backend.isInstalled(LEGACY_FLOW_DUE_JOB))) return;
  const res = await backend.remove(LEGACY_FLOW_DUE_JOB);
  if (!res.ok) console.warn("[tasks] could not remove legacy flow-due job:", res.error);
  const launcher = join(getAppDataDir(), "run-flow-due.cmd");
  try {
    if (existsSync(launcher)) unlinkSync(launcher);
  } catch {
    /* ignore */
  }
}

export function initTaskService(): void {
  try {
    migrateLegacyFlows();
  } catch (err) {
    console.warn("[tasks] flow migration failed:", err);
  }
  void removeLegacyFlowDueJob().catch((err) => {
    console.warn("[tasks] legacy scheduler cleanup failed:", err);
  });
}

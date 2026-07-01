import { app } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import { run } from "../utils/exec.js";

export const FLOW_DUE_TASK_NAME = "AI Shelf Flow Due";

export type FlowTaskSchedulerStatus = {
  supported: boolean;
  installed: boolean;
  taskName: string;
  launcherPath?: string;
};

function resolveFlowDueCliPath(): string {
  const root = app.isPackaged ? app.getAppPath() : process.cwd();
  return join(root, "dist", "flow", "cli.js");
}

function quoteSchtasksArg(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`;
}

function writeFlowDueLauncher(): string {
  const launcherPath = join(getAppDataDir(), "run-flow-due.cmd");
  const cliPath = resolveFlowDueCliPath();
  let content: string;

  if (app.isPackaged) {
    const exe = process.execPath;
    content = `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${exe}" "${cliPath}" due\r\n`;
  } else {
    const root = process.cwd();
    content = `@echo off\r\ncd /d "${root}"\r\nnode "${cliPath}" due\r\n`;
  }

  writeFileSync(launcherPath, content, "utf8");
  return launcherPath;
}

export async function getFlowTaskSchedulerStatus(): Promise<FlowTaskSchedulerStatus> {
  const base: FlowTaskSchedulerStatus = {
    supported: process.platform === "win32",
    installed: false,
    taskName: FLOW_DUE_TASK_NAME,
  };
  if (!base.supported) return base;

  const res = await run("schtasks", ["/Query", "/TN", FLOW_DUE_TASK_NAME, "/FO", "LIST"], 15_000);
  base.installed = res.ok;
  if (base.installed) {
    base.launcherPath = join(getAppDataDir(), "run-flow-due.cmd");
  }
  return base;
}

export async function installFlowTaskScheduler(): Promise<{
  ok: boolean;
  error?: string;
  status?: FlowTaskSchedulerStatus;
}> {
  if (process.platform !== "win32") {
    return { ok: false, error: "Task Scheduler setup is only supported on Windows" };
  }

  try {
    const launcherPath = writeFlowDueLauncher();
    const tr = quoteSchtasksArg(launcherPath);
    const create = await run(
      "schtasks",
      [
        "/Create",
        "/TN",
        FLOW_DUE_TASK_NAME,
        "/TR",
        tr,
        "/SC",
        "MINUTE",
        "/MO",
        "1",
        "/F",
      ],
      30_000,
    );
    if (!create.ok) {
      const detail = create.stderr || create.stdout || "schtasks /Create failed";
      return { ok: false, error: detail };
    }
    const status = await getFlowTaskSchedulerStatus();
    return { ok: true, status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function removeFlowTaskScheduler(): Promise<{
  ok: boolean;
  error?: string;
  status?: FlowTaskSchedulerStatus;
}> {
  if (process.platform !== "win32") {
    return { ok: false, error: "Task Scheduler setup is only supported on Windows" };
  }

  const del = await run("schtasks", ["/Delete", "/TN", FLOW_DUE_TASK_NAME, "/F"], 30_000);
  if (!del.ok) {
    const detail = del.stderr || del.stdout || "schtasks /Delete failed";
    return { ok: false, error: detail };
  }
  const status = await getFlowTaskSchedulerStatus();
  return { ok: true, status };
}

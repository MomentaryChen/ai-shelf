import { app } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import type { OsSchedule } from "../shared/os-schedule.js";
import { getOsSchedulerBackend, type OsJobSpec, type OsSchedulerKind } from "./os-scheduler.js";

export const FLOW_DUE_TASK_NAME = "AI Shelf Flow Due";
export const FLOW_DUE_LAUNCHD_LABEL = "com.ai-shelf.flow-due";
export const FLOW_DUE_SYSTEMD_UNIT = "ai-shelf-flow-due";

/** OS job fires every minute; per-flow cron is evaluated by `flow due`. */
const FLOW_DUE_SCHEDULE: OsSchedule = { kind: "interval", minutes: 1 };

export type FlowTaskSchedulerStatus = {
  supported: boolean;
  installed: boolean;
  taskName: string;
  backend?: OsSchedulerKind;
  /** Windows `.cmd` launcher. */
  launcherPath?: string;
  /** LaunchAgent plist or systemd timer file. */
  definitionPath?: string;
  /** Set when the platform has a backend but it cannot be used (e.g. no systemd --user). */
  unavailableReason?: string;
};

type ActionResult = { ok: boolean; error?: string; status?: FlowTaskSchedulerStatus };

function resolveFlowDueCliPath(): string {
  const root = app.isPackaged ? app.getAppPath() : process.cwd();
  return join(root, "dist", "flow", "cli.js");
}

function launcherPathFor(): string {
  return join(getAppDataDir(), "run-flow-due.cmd");
}

function writeFlowDueLauncher(): string {
  const launcherPath = launcherPathFor();
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

function baseSpec(): Omit<OsJobSpec, "program" | "args"> {
  return {
    description: "AI Shelf — run due AI Flows",
    names: {
      windowsTaskName: FLOW_DUE_TASK_NAME,
      launchdLabel: FLOW_DUE_LAUNCHD_LABEL,
      systemdUnit: FLOW_DUE_SYSTEMD_UNIT,
    },
    schedule: FLOW_DUE_SCHEDULE,
  };
}

/**
 * Job spec for macOS / Linux: run the bundled Electron binary as Node (same ABI as the app's
 * native modules) on `dist/flow/cli.js due`. launchd/systemd do not inherit the login PATH, so
 * a bare `node` would not resolve.
 */
function posixFlowDueSpec(): { ok: true; spec: OsJobSpec } | { ok: false; error: string } {
  if (process.env.APPIMAGE) {
    return {
      ok: false,
      error:
        "Scheduling is not supported when running from an AppImage (its mount path changes every launch). " +
        'Extract the AppImage or add a crontab entry that runs "ai-shelf flow due" every minute.',
    };
  }
  return {
    ok: true,
    spec: {
      ...baseSpec(),
      program: process.execPath,
      args: [resolveFlowDueCliPath(), "due"],
      workingDirectory: app.isPackaged ? undefined : process.cwd(),
      environment: { ELECTRON_RUN_AS_NODE: "1" },
      logPath: join(getAppDataDir(), "flow-due.log"),
    },
  };
}

/** Spec used for status/remove (does not write the Windows launcher). */
function describeSpec(): OsJobSpec {
  return { ...baseSpec(), program: launcherPathFor(), args: [] };
}

export async function getFlowTaskSchedulerStatus(): Promise<FlowTaskSchedulerStatus> {
  const backend = getOsSchedulerBackend();
  const base: FlowTaskSchedulerStatus = {
    supported: backend !== null,
    installed: false,
    taskName: FLOW_DUE_TASK_NAME,
  };
  if (!backend) return base;

  const spec = describeSpec();
  base.backend = backend.kind;
  base.taskName = backend.jobName(spec);
  const unavailable = await backend.unavailableReason();
  if (unavailable) {
    base.supported = false;
    base.unavailableReason = unavailable;
    return base;
  }

  base.installed = await backend.isInstalled(spec);
  if (base.installed) {
    if (backend.kind === "windows-task-scheduler") base.launcherPath = launcherPathFor();
    else base.definitionPath = backend.definitionPath(spec);
  }
  return base;
}

export async function installFlowTaskScheduler(): Promise<ActionResult> {
  const backend = getOsSchedulerBackend();
  if (!backend) {
    return { ok: false, error: `Scheduling is not supported on ${process.platform}` };
  }

  try {
    let spec: OsJobSpec;
    if (backend.kind === "windows-task-scheduler") {
      spec = { ...baseSpec(), program: writeFlowDueLauncher(), args: [] };
    } else {
      const posix = posixFlowDueSpec();
      if (!posix.ok)
        return { ok: false, error: posix.error, status: await getFlowTaskSchedulerStatus() };
      spec = posix.spec;
    }
    const res = await backend.install(spec);
    if (!res.ok) return { ok: false, error: res.error };
    const status = await getFlowTaskSchedulerStatus();
    return { ok: true, status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function removeFlowTaskScheduler(): Promise<ActionResult> {
  const backend = getOsSchedulerBackend();
  if (!backend) {
    return { ok: false, error: `Scheduling is not supported on ${process.platform}` };
  }

  try {
    const res = await backend.remove(describeSpec());
    if (!res.ok) return { ok: false, error: res.error };
    const status = await getFlowTaskSchedulerStatus();
    return { ok: true, status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

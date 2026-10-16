import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildLaunchdPlist,
  buildSchtasksCreateArgs,
  buildSystemdService,
  buildSystemdTimer,
  type OsSchedule,
} from "../shared/os-schedule.js";
import { run } from "../utils/exec.js";

/**
 * Platform abstraction over the OS job schedulers AI Shelf can register a recurring job with.
 * Content generation lives in `src/shared/os-schedule.ts` (pure, unit-tested); this file only
 * writes files and shells out to `schtasks` / `launchctl` / `systemctl --user`.
 */

export type OsSchedulerKind = "windows-task-scheduler" | "launchd" | "systemd";

export type OsJobSpec = {
  /** Human-readable description (systemd `Description=`). */
  description: string;
  names: {
    /** Task Scheduler task name, e.g. `AI Shelf Flow Due`. */
    windowsTaskName: string;
    /** LaunchAgent label, e.g. `com.ai-shelf.flow-due`. */
    launchdLabel: string;
    /** systemd unit base name (no suffix), e.g. `ai-shelf-flow-due`. */
    systemdUnit: string;
  };
  program: string;
  args: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  /** stdout/stderr log file (launchd only; systemd logs to the journal). */
  logPath?: string;
  schedule: OsSchedule;
};

export type OsSchedulerResult = { ok: true } | { ok: false; error: string };

export interface OsSchedulerBackend {
  readonly kind: OsSchedulerKind;
  /** Display name of the job for this backend (task name / label / timer unit). */
  jobName(spec: OsJobSpec): string;
  /** Where the job definition is stored on disk, if this backend uses a file. */
  definitionPath(spec: OsJobSpec): string | undefined;
  /** `null` when usable, otherwise a user-facing reason. */
  unavailableReason(): Promise<string | null>;
  isInstalled(spec: OsJobSpec): Promise<boolean>;
  install(spec: OsJobSpec): Promise<OsSchedulerResult>;
  remove(spec: OsJobSpec): Promise<OsSchedulerResult>;
}

function failure(res: { stdout: string; stderr: string }, fallback: string): OsSchedulerResult {
  return { ok: false, error: res.stderr || res.stdout || fallback };
}

function quoteSchtasksArg(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// Windows — Task Scheduler
// ---------------------------------------------------------------------------

const windowsBackend: OsSchedulerBackend = {
  kind: "windows-task-scheduler",
  jobName: (spec) => spec.names.windowsTaskName,
  definitionPath: () => undefined,
  unavailableReason: () => Promise.resolve(null),
  async isInstalled(spec) {
    const res = await run(
      "schtasks",
      ["/Query", "/TN", spec.names.windowsTaskName, "/FO", "LIST"],
      15_000,
    );
    return res.ok;
  },
  async install(spec) {
    const tr = [quoteSchtasksArg(spec.program), ...spec.args.map(quoteSchtasksArg)].join(" ");
    const built = buildSchtasksCreateArgs(spec.names.windowsTaskName, tr, spec.schedule);
    if (!built.ok) return built;
    const create = await run("schtasks", built.args, 30_000);
    if (!create.ok) return failure(create, "schtasks /Create failed");
    return { ok: true };
  },
  async remove(spec) {
    const del = await run("schtasks", ["/Delete", "/TN", spec.names.windowsTaskName, "/F"], 30_000);
    if (!del.ok) return failure(del, "schtasks /Delete failed");
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// macOS — launchd LaunchAgent
// ---------------------------------------------------------------------------

function launchdDomain(): string {
  return `gui/${String(process.getuid?.() ?? 501)}`;
}

function launchAgentPath(spec: OsJobSpec): string {
  return join(homedir(), "Library", "LaunchAgents", `${spec.names.launchdLabel}.plist`);
}

const launchdBackend: OsSchedulerBackend = {
  kind: "launchd",
  jobName: (spec) => spec.names.launchdLabel,
  definitionPath: launchAgentPath,
  unavailableReason: () => Promise.resolve(null),
  async isInstalled(spec) {
    const res = await run(
      "launchctl",
      ["print", `${launchdDomain()}/${spec.names.launchdLabel}`],
      15_000,
    );
    return res.ok;
  },
  async install(spec) {
    const built = buildLaunchdPlist({
      label: spec.names.launchdLabel,
      programArguments: [spec.program, ...spec.args],
      schedule: spec.schedule,
      workingDirectory: spec.workingDirectory,
      environment: spec.environment,
      standardOutPath: spec.logPath,
      standardErrorPath: spec.logPath,
    });
    if (!built.ok) return built;
    const plistPath = launchAgentPath(spec);
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(plistPath, built.plist, "utf8");
    // Re-install: unload any previous definition first (fails harmlessly when not loaded).
    await run("launchctl", ["bootout", `${launchdDomain()}/${spec.names.launchdLabel}`], 15_000);
    const boot = await run("launchctl", ["bootstrap", launchdDomain(), plistPath], 30_000);
    if (!boot.ok) return failure(boot, "launchctl bootstrap failed");
    return { ok: true };
  },
  async remove(spec) {
    const out = await run(
      "launchctl",
      ["bootout", `${launchdDomain()}/${spec.names.launchdLabel}`],
      30_000,
    );
    const plistPath = launchAgentPath(spec);
    if (existsSync(plistPath)) unlinkSync(plistPath);
    if (!out.ok && (await this.isInstalled(spec))) return failure(out, "launchctl bootout failed");
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Linux — systemd user timer
// ---------------------------------------------------------------------------

function systemdUserDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "systemd", "user");
}

const systemdBackend: OsSchedulerBackend = {
  kind: "systemd",
  jobName: (spec) => `${spec.names.systemdUnit}.timer`,
  definitionPath: (spec) => join(systemdUserDir(), `${spec.names.systemdUnit}.timer`),
  async unavailableReason() {
    const res = await run("systemctl", ["--user", "show-environment"], 15_000);
    if (res.ok) return null;
    const detail = res.stderr || res.stdout || "systemctl not found";
    return `systemd user session is not available (systemctl --user: ${detail}). Add a crontab entry that runs "ai-shelf flow due" every minute instead.`;
  },
  async isInstalled(spec) {
    const res = await run(
      "systemctl",
      ["--user", "is-enabled", `${spec.names.systemdUnit}.timer`],
      15_000,
    );
    return res.ok;
  },
  async install(spec) {
    const unavailable = await this.unavailableReason();
    if (unavailable) return { ok: false, error: unavailable };
    const unit = spec.names.systemdUnit;
    const timer = buildSystemdTimer({
      description: spec.description,
      unit: `${unit}.service`,
      schedule: spec.schedule,
    });
    if (!timer.ok) return timer;
    const service = buildSystemdService({
      description: spec.description,
      execStart: [spec.program, ...spec.args],
      workingDirectory: spec.workingDirectory,
      environment: spec.environment,
    });
    const dir = systemdUserDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${unit}.service`), service, "utf8");
    writeFileSync(join(dir, `${unit}.timer`), timer.timer, "utf8");
    const reload = await run("systemctl", ["--user", "daemon-reload"], 30_000);
    if (!reload.ok) return failure(reload, "systemctl --user daemon-reload failed");
    const enable = await run("systemctl", ["--user", "enable", "--now", `${unit}.timer`], 30_000);
    if (!enable.ok) return failure(enable, "systemctl --user enable --now failed");
    return { ok: true };
  },
  async remove(spec) {
    const unit = spec.names.systemdUnit;
    const disable = await run("systemctl", ["--user", "disable", "--now", `${unit}.timer`], 30_000);
    const dir = systemdUserDir();
    for (const file of [`${unit}.timer`, `${unit}.service`]) {
      const p = join(dir, file);
      if (existsSync(p)) unlinkSync(p);
    }
    await run("systemctl", ["--user", "daemon-reload"], 30_000);
    if (!disable.ok && (await this.isInstalled(spec)))
      return failure(disable, "systemctl --user disable failed");
    return { ok: true };
  },
};

export function getOsSchedulerBackend(
  platform: NodeJS.Platform = process.platform,
): OsSchedulerBackend | null {
  switch (platform) {
    case "win32":
      return windowsBackend;
    case "darwin":
      return launchdBackend;
    case "linux":
      return systemdBackend;
    default:
      return null;
  }
}

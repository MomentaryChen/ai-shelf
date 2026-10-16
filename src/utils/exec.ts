import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";

export type RunOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

/** Quote one argument for `cmd.exe /c` (paths with spaces stay intact). */
function quoteCmdArg(arg: string): string {
  if (!/[\s"]/u.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/** Windows: bare names like `agent` / `claude` are `.cmd` shims — run via cmd, not execFile directly. */
function windowsNeedsCmdShim(cmd: string): boolean {
  if (/\.exe$/iu.test(cmd)) return false;
  if (/\.(cmd|bat)$/iu.test(cmd)) return true;
  return !/[\\/]/u.test(cmd);
}

/** Resolve the file/argv to spawn, wrapping Windows `.cmd` shims in `cmd.exe /c`. */
function resolveCommand(cmd: string, args: string[]): { file: string; argv: string[] } {
  if (platform() === "win32" && windowsNeedsCmdShim(cmd)) {
    return {
      file: process.env.ComSpec ?? "cmd.exe",
      argv: ["/d", "/s", "/c", [quoteCmdArg(cmd), ...args.map(quoteCmdArg)].join(" ")],
    };
  }
  return { file: cmd, argv: args };
}

export type StreamingResult = {
  ok: boolean;
  /** Exit code, or null when the process was killed by a signal or failed to start. */
  code: number | null;
  signal: NodeJS.Signals | null;
  /** True when the process was killed because it exceeded `timeoutMs`. */
  timedOut: boolean;
  /** Spawn error (e.g. command not found). */
  error?: Error;
};

/**
 * Run a command with stdout/stderr inherited, so output is shown live.
 * Success is determined by the exit code. `timeoutMs <= 0` disables the timeout.
 */
export function runStreaming(
  cmd: string,
  args: string[] = [],
  options: RunOptions = {},
): Promise<StreamingResult> {
  const { file, argv } = resolveCommand(cmd, args);
  const timeoutMs = options.timeoutMs ?? 0;

  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;
    const finish = (result: StreamingResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(file, argv, {
      stdio: "inherit",
      windowsHide: true,
      shell: false,
      env: options.env ?? process.env,
    });

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, timeoutMs)
        : undefined;

    child.on("error", (error) => {
      finish({ ok: false, code: null, signal: null, timedOut, error });
    });
    child.on("close", (code, signal) => {
      finish({ ok: !timedOut && code === 0, code, signal, timedOut });
    });
  });
}

export function run(
  cmd: string,
  args: string[] = [],
  timeoutMs = 10_000,
  options: RunOptions = {},
): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  const env = options.env ?? process.env;
  const timeout = options.timeoutMs ?? timeoutMs;

  const { file, argv } = resolveCommand(cmd, args);

  return new Promise((resolve) => {
    execFile(
      file,
      argv,
      { timeout, windowsHide: true, shell: false, env },
      (err, stdout, stderr) => {
        resolve({
          stdout: (stdout ?? "").trim(),
          stderr: (stderr ?? "").trim(),
          ok: !err,
        });
      },
    );
  });
}

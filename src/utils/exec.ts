import { execFile } from "node:child_process";
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

export function run(
  cmd: string,
  args: string[] = [],
  timeoutMs = 10_000,
  options: RunOptions = {},
): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  const env = options.env ?? process.env;
  const timeout = options.timeoutMs ?? timeoutMs;

  let file = cmd;
  let argv = args;

  if (platform() === "win32" && windowsNeedsCmdShim(cmd)) {
    file = process.env.ComSpec ?? "cmd.exe";
    argv = ["/d", "/s", "/c", [quoteCmdArg(cmd), ...args.map(quoteCmdArg)].join(" ")];
  }

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

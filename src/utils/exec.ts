import { execFile } from "node:child_process";

export function run(
  cmd: string,
  args: string[] = [],
  timeoutMs = 10_000
): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, shell: true }, (err, stdout, stderr) => {
      resolve({
        stdout: (stdout ?? "").trim(),
        stderr: (stderr ?? "").trim(),
        ok: !err,
      });
    });
  });
}

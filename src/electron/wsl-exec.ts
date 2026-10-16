import { execFile } from "node:child_process";
import { platform } from "node:os";
import { parseWslListQuiet } from "../shared/wsl-paths.js";

export const WSL_TIMEOUT_MS = 12_000;

export type WslRunResult =
  | { ok: true; stdout: Buffer | string }
  | { ok: false; error: string; code?: string };

/** Run `wsl.exe` without a shell. Buffer output by default (wsl.exe speaks UTF-16LE). */
export function runWsl(
  args: string[],
  opts?: { encoding?: "buffer" | "utf8"; timeoutMs?: number },
): Promise<WslRunResult> {
  return new Promise((resolve) => {
    const encoding = opts?.encoding ?? "buffer";
    execFile(
      "wsl.exe",
      args,
      {
        timeout: opts?.timeoutMs ?? WSL_TIMEOUT_MS,
        windowsHide: true,
        shell: false,
        encoding: encoding === "utf8" ? "utf8" : "buffer",
      },
      (err, stdout, stderr) => {
        if (err) {
          const message =
            (typeof stderr === "string" ? stderr : stderr.toString("utf8")) ||
            err.message ||
            "wsl.exe failed";
          const code = "code" in err ? String(err.code) : undefined;
          resolve({
            ok: false,
            error: message.replace(/\0/gu, "").trim() || "wsl.exe failed",
            code,
          });
          return;
        }
        resolve({ ok: true, stdout: stdout as Buffer | string });
      },
    );
  });
}

/**
 * Names of distros that are already running (`wsl -l --running -q`).
 * Never starts a stopped distro. Empty on non-Windows hosts, when wsl.exe is
 * missing, or when nothing is running (wsl.exe exits non-zero in that case).
 */
export async function listRunningWslDistros(timeoutMs = 4_000): Promise<string[]> {
  if (platform() !== "win32") return [];
  const result = await runWsl(["-l", "--running", "-q"], { encoding: "buffer", timeoutMs });
  if (!result.ok) return [];
  return parseWslListQuiet(result.stdout);
}

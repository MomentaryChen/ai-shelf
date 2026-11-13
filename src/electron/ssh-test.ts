import { spawn } from "node:child_process";
import { homedir } from "node:os";
import {
  SSH_CLIENT_NOT_FOUND_ERROR,
  buildSshArgs,
  normalizeRemoteSshConfig,
  prepareSshJumpConfig,
  resolveSshExecutable,
} from "ai-shelf";

export type SshTestResult =
  | { ok: true; durationMs: number; client: string }
  | {
      ok: false;
      /** `invalid` / `no-client` never reached ssh; `failed` = ssh exited non-zero; `timeout` = killed. */
      reason: "invalid" | "no-client" | "failed" | "timeout";
      exitCode: number | null;
      /** Tail of ssh's stderr + stdout, for classification and the details view. */
      output: string;
      durationMs: number;
      client: string | null;
    };

/** Hard stop for the whole probe (ConnectTimeout is per hop; a 4-hop route may need longer). */
const PROBE_TIMEOUT_MS = 45_000;
const MAX_OUTPUT = 8_000;

/**
 * Connect through the profile's full route and run `exit 0` without a TTY
 * (BatchMode: no password / passphrase / host-key prompts). Success means every
 * hop is reachable and key / agent auth works end to end.
 */
export async function testSshConnection(
  raw: unknown,
  jumpConfigDir: string,
): Promise<SshTestResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const remote = normalizeRemoteSshConfig(raw);
  if (!remote) {
    return {
      ok: false,
      reason: "invalid",
      exitCode: null,
      output: "Invalid SSH remote configuration",
      durationMs: 0,
      client: null,
    };
  }
  const client = resolveSshExecutable();
  if (!client) {
    return {
      ok: false,
      reason: "no-client",
      exitCode: null,
      output: SSH_CLIENT_NOT_FOUND_ERROR,
      durationMs: 0,
      client: null,
    };
  }

  let jumpConfig: { dir: string; fileName: string } | null;
  let args: string[];
  try {
    jumpConfig = prepareSshJumpConfig(remote, jumpConfigDir);
    args = buildSshArgs(remote, undefined, { jumpConfigFile: jumpConfig?.fileName, probe: true });
  } catch (err) {
    return {
      ok: false,
      reason: "invalid",
      exitCode: null,
      output: (err as Error).message,
      durationMs: elapsed(),
      client,
    };
  }

  return new Promise<SshTestResult>((resolve) => {
    let output = "";
    let settled = false;
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-MAX_OUTPUT);
    };
    const child = spawn(client, args, {
      cwd: jumpConfig?.dir ?? homedir(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const finish = (result: SshTestResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        reason: "timeout",
        exitCode: null,
        output: output.trim(),
        durationMs: elapsed(),
        client,
      });
    }, PROBE_TIMEOUT_MS);
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => {
      finish({
        ok: false,
        reason: "failed",
        exitCode: null,
        output: err.message,
        durationMs: elapsed(),
        client,
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true, durationMs: elapsed(), client });
        return;
      }
      finish({
        ok: false,
        reason: "failed",
        exitCode: code,
        output: output.trim(),
        durationMs: elapsed(),
        client,
      });
    });
  });
}

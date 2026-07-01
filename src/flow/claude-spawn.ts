import { spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";
import { appendFlowPromptLog } from "./flow-chat-store.js";

/** Quote one argument for `cmd.exe /c` (paths with spaces stay intact). */
function quoteCmdArg(arg: string): string {
  if (!/[\s"]/u.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function windowsNeedsCmdShim(cmd: string): boolean {
  if (/\.exe$/iu.test(cmd)) return false;
  if (/\.(cmd|bat)$/iu.test(cmd)) return true;
  return !/[\\/]/u.test(cmd);
}

export type SpawnAgentPrintOptions = {
  /** Resolved launch command, e.g. `claude --model opus` or `agent`. */
  launchCommand: string;
  prompt: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Print-mode flags before tool-specific args (default: claude `-p --input-format text`). */
  printPrefix?: string[];
  /** Flags after print mode (e.g. `--mcp-config`, path). */
  args?: string[];
  promptLog?: {
    flowId: string;
    kind: "generate" | "run";
    runId?: string;
  };
};

/**
 * Run an agent CLI in print mode with the prompt on stdin.
 * Uses a cmd.exe shim on Windows for bare command names (same as terminal).
 */
export function spawnAgentPrint(options: SpawnAgentPrintOptions): ChildProcess {
  const {
    launchCommand,
    prompt,
    env = process.env,
    cwd,
    printPrefix = ["-p", "--input-format", "text"],
    args = [],
    promptLog,
  } = options;
  const printArgs = [...printPrefix, ...args];

  if (promptLog?.flowId) {
    appendFlowPromptLog(promptLog.flowId, {
      kind: promptLog.kind,
      runId: promptLog.runId,
      inputFormat: "text",
      prompt,
      cliArgs: [...launchCommand.split(/\s+/), ...printArgs],
    });
  }

  const cmdLine = [launchCommand.trim(), ...printArgs.map(quoteCmdArg)].join(" ");
  const bin = launchCommand.trim().split(/\s+/)[0] ?? "claude";
  let file = bin;
  let argv: string[] = [...launchCommand.trim().split(/\s+/).slice(1), ...printArgs];

  if (platform() === "win32" && windowsNeedsCmdShim(bin)) {
    file = process.env.ComSpec ?? "cmd.exe";
    argv = ["/d", "/s", "/c", cmdLine];
  }

  const child = spawn(file, argv, {
    windowsHide: true,
    env,
    cwd: cwd?.trim() || undefined,
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin?.write(prompt);
  child.stdin?.end();

  return child;
}

export type SpawnClaudePrintOptions = Omit<SpawnAgentPrintOptions, "launchCommand"> & {
  launchCommand?: string;
};

/** @deprecated Use spawnAgentPrint */
export function spawnClaudePrint(options: SpawnClaudePrintOptions): ChildProcess {
  return spawnAgentPrint({
    ...options,
    launchCommand: options.launchCommand ?? "claude",
  });
}

import { spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";

/**
 * Quote one argument for a `cmd.exe /c` command line.
 * Empty strings must be quoted as `""` or cmd drops them (e.g. `--tools ""`
 * becomes `--tools` and swallows the next flag), and cmd metacharacters
 * (& | < > ^ ( ) ; , = % !) must be quoted or cmd.exe interprets them.
 */
export function quoteCmdArg(arg: string): string {
  if (arg === "") return '""';
  if (!/[\s"&|<>^()%!;,=]/u.test(arg)) return arg;
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
  /** Deliver prompt on stdin (default) or as a trailing CLI argument (gemini). */
  promptDelivery?: "stdin" | "arg";
};

/**
 * Run an agent CLI in print mode with the prompt on stdin (or as a trailing arg).
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
    promptDelivery = "stdin",
  } = options;
  const printArgs =
    promptDelivery === "arg" ? [...printPrefix, ...args, prompt] : [...printPrefix, ...args];

  const cmdLine = [launchCommand.trim(), ...printArgs.map(quoteCmdArg)].join(" ");
  const bin = launchCommand.trim().split(/\s+/)[0] ?? "claude";
  let file = bin;
  let argv: string[] = [...launchCommand.trim().split(/\s+/).slice(1), ...printArgs];
  let verbatim = false;

  if (platform() === "win32" && windowsNeedsCmdShim(bin)) {
    file = process.env.ComSpec ?? "cmd.exe";
    // Wrap in quotes that `/s` strips, and pass verbatim (like node's
    // `shell: true`): otherwise spawn backslash-escapes the inner quotes and
    // the .cmd shim's %* delivers them to the child as literal `"` characters.
    argv = ["/d", "/s", "/c", `"${cmdLine}"`];
    verbatim = true;
  }

  const child = spawn(file, argv, {
    windowsHide: true,
    windowsVerbatimArguments: verbatim,
    env,
    cwd: cwd?.trim() || undefined,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (promptDelivery === "stdin") {
    child.stdin.write(prompt);
  }
  child.stdin.end();

  return child;
}

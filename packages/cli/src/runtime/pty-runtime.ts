import { homedir } from "node:os";
import type { IPty } from "node-pty";
import { RuntimeError } from "../core/errors/app-error.js";
import type { OutputBuffer } from "./output-buffer.js";

export const PLAIN_SHELL_TOOL_ID = "shell";

export const TOOL_LAUNCH_CMD: Record<string, string> = {
  claude: "claude",
  copilot: "copilot",
  cursor: "cursor",
  "cursor-agent": "agent",
  agent: "agent",
  codex: "codex",
  gemini: "gemini",
  aider: "aider",
  opencode: "opencode",
};

export interface PtySpawnOptions {
  cwd: string;
  shell?: string;
  tool?: string;
  command?: string;
  cols?: number;
  rows?: number;
  onData?: (data: string) => void;
  onExit?: (exitCode: number) => void;
}

export interface PtyHandle {
  runtimeId: string;
  pid: number;
  proc: IPty;
}

export class PtyRuntime {
  private readonly processes = new Map<string, IPty>();
  private ptyModule: typeof import("node-pty") | null = null;

  constructor(private readonly outputBuffer: OutputBuffer) {}

  private async getPty(): Promise<typeof import("node-pty")> {
    if (!this.ptyModule) {
      this.ptyModule = await import("node-pty");
    }
    return this.ptyModule;
  }

  async spawn(runtimeId: string, options: PtySpawnOptions): Promise<PtyHandle> {
    if (this.processes.has(runtimeId)) {
      throw new RuntimeError(`PTY already running: ${runtimeId}`);
    }

    const pty = await this.getPty();
    const isWin = process.platform === "win32";
    const workDir = options.cwd || homedir();
    const cmd = options.command ?? resolveLaunchCommand(options.tool);
    const interactive = cmd === "";

    const winArgs = (shell: string): string[] =>
      interactive
        ? ["-NoLogo", "-NoExit"]
        : shell === "cmd.exe"
          ? ["/k", cmd]
          : ["-NoLogo", "-NoExit", "-Command", cmd];

    const windowsCandidates: [string, string[]][] = [
      ["pwsh.exe", winArgs("pwsh.exe")],
      ["powershell.exe", winArgs("powershell.exe")],
      ["cmd.exe", winArgs("cmd.exe")],
    ];
    const unixShell = "/bin/bash";
    const unixArgs = interactive ? [] : ["-c", `${cmd}; exec bash`];

    const ptyOpts = {
      name: "xterm-256color",
      cols: options.cols ?? 120,
      rows: options.rows ?? 30,
      cwd: workDir,
      env: {
        ...process.env,
        COLORTERM: "truecolor",
        TERM_PROGRAM: "vscode",
        WT_SESSION: process.env.WT_SESSION ?? "ai-shelf",
      } as Record<string, string>,
    };

    let proc: IPty | undefined;
    if (isWin) {
      const shellPref = options.shell ?? "pwsh";
      const ordered =
        shellPref === "cmd"
          ? [...windowsCandidates].reverse()
          : shellPref === "powershell"
            ? [windowsCandidates[1], windowsCandidates[0], windowsCandidates[2]].filter(
                (x): x is [string, string[]] => x !== undefined,
              )
            : windowsCandidates;
      for (const [sh, args] of ordered) {
        try {
          proc = pty.spawn(sh, args, ptyOpts);
          break;
        } catch {
          /* try next shell */
        }
      }
      if (!proc) throw new RuntimeError("No suitable shell found (pwsh / powershell / cmd)");
    } else {
      proc = pty.spawn(unixShell, unixArgs.length ? unixArgs : [], ptyOpts);
    }

    this.processes.set(runtimeId, proc);

    proc.onData((data) => {
      this.outputBuffer.append(runtimeId, data);
      options.onData?.(data);
    });

    proc.onExit(({ exitCode }) => {
      this.processes.delete(runtimeId);
      this.outputBuffer.clear(runtimeId);
      options.onExit?.(exitCode);
    });

    return { runtimeId, pid: proc.pid, proc };
  }

  write(runtimeId: string, data: string): void {
    const proc = this.processes.get(runtimeId);
    if (!proc) throw new RuntimeError(`PTY not running: ${runtimeId}`);
    proc.write(data);
  }

  resize(runtimeId: string, cols: number, rows: number): void {
    this.processes.get(runtimeId)?.resize(cols, rows);
  }

  kill(runtimeId: string): void {
    const proc = this.processes.get(runtimeId);
    if (!proc) return;
    try {
      proc.kill();
    } catch {
      /* already dead */
    }
    this.processes.delete(runtimeId);
    this.outputBuffer.clear(runtimeId);
  }

  get(runtimeId: string): IPty | undefined {
    return this.processes.get(runtimeId);
  }

  getPreview(runtimeId: string, maxChars?: number): string {
    return this.outputBuffer.getPreview(runtimeId, maxChars);
  }
}

function resolveLaunchCommand(tool?: string): string {
  if (tool === PLAIN_SHELL_TOOL_ID) return "";
  if (tool && TOOL_LAUNCH_CMD[tool]) return TOOL_LAUNCH_CMD[tool];
  return "";
}

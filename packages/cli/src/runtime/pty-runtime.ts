import { homedir } from "node:os";
import type { IPty } from "node-pty";
import { RuntimeError } from "../core/errors/app-error.js";
import type { OutputBuffer } from "./output-buffer.js";
import {
  NO_SUITABLE_UNIX_SHELL_ERROR,
  NO_SUITABLE_WINDOWS_SHELL_ERROR,
  resolvePtySpawnPlan,
} from "./pty-shell.js";

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
    const workDir = options.cwd || homedir();
    const cmd = options.command ?? resolveLaunchCommand(options.tool);
    const plan = resolvePtySpawnPlan({
      command: cmd,
      shell: options.shell,
    });

    const ptyOpts = {
      name: "xterm-256color",
      cols: options.cols ?? 120,
      rows: options.rows ?? 30,
      cwd: workDir,
      env: plan.env,
    };

    let proc: IPty | undefined;
    const candidates =
      plan.platform === "win32" ? plan.windowsCandidates : plan.unixCandidates;
    for (const [sh, args] of candidates) {
      try {
        proc = pty.spawn(sh, args, ptyOpts);
        break;
      } catch {
        /* try next shell */
      }
    }
    if (!proc) {
      throw new RuntimeError(
        plan.platform === "win32"
          ? NO_SUITABLE_WINDOWS_SHELL_ERROR
          : NO_SUITABLE_UNIX_SHELL_ERROR,
      );
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

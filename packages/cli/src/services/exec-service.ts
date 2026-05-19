import type { SessionModel } from "../models/session.js";
import type { SessionService } from "./session-service.js";
import type { SessionRuntime } from "../runtime/session-runtime.js";
import type { CommandHistoryRepository } from "../database/repositories/command-history-repository.js";
import { AppError } from "../core/errors/app-error.js";

export interface ExecResult {
  sessionName: string;
}

export interface BroadcastExecResult {
  command: string;
  sent: string[];
  skipped: { name: string; reason: string }[];
}

export interface ExecOptions {
  session?: string;
  broadcast?: boolean;
}

export class ExecService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionRuntime: SessionRuntime,
    private readonly history: CommandHistoryRepository,
  ) {}

  /**
   * Send command to one session (default: first alphabetically) or broadcast to all running in group.
   */
  exec(
    workspaceName: string,
    groupName: string,
    command: string,
    options?: ExecOptions,
  ): ExecResult | BroadcastExecResult {
    if (options?.broadcast && options?.session) {
      throw new AppError(
        "Use either --session or --broadcast, not both",
        "EXEC_OPTIONS_CONFLICT",
      );
    }

    if (options?.broadcast) {
      return this.execBroadcast(workspaceName, groupName, command);
    }

    const sessions = this.sessionService.list(workspaceName, groupName);
    if (sessions.length === 0) {
      throw new AppError(`No sessions in group "${groupName}"`, "NO_SESSIONS");
    }

    const target = options?.session
      ? this.sessionService.resolveSession(workspaceName, groupName, options.session)
      : [...sessions].sort((a, b) => a.name.localeCompare(b.name))[0]!;

    this.writeToSession(target, command);
    return { sessionName: target.name };
  }

  /** Send command to every running session in the group. */
  execBroadcast(
    workspaceName: string,
    groupName: string,
    command: string,
  ): BroadcastExecResult {
    const sessions = this.sessionService.list(workspaceName, groupName);
    if (sessions.length === 0) {
      throw new AppError(`No sessions in group "${groupName}"`, "NO_SESSIONS");
    }

    const sent: string[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const session of sessions) {
      if (session.status !== "running") {
        skipped.push({ name: session.name, reason: session.status });
        continue;
      }
      try {
        this.writeToSession(session, command);
        sent.push(session.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        skipped.push({ name: session.name, reason: msg });
      }
    }

    if (sent.length === 0) {
      throw new AppError(
        `No running sessions in group "${groupName}" (${skipped.length} skipped)`,
        "NO_RUNNING_SESSIONS",
      );
    }

    return { command, sent, skipped };
  }

  private writeToSession(session: SessionModel, command: string): void {
    if (session.status !== "running") {
      throw new AppError(
        `Session "${session.name}" is not running (status: ${session.status})`,
        "SESSION_NOT_RUNNING",
      );
    }

    const line = command.endsWith("\n") || command.endsWith("\r") ? command : `${command}\r`;
    this.sessionRuntime.write(session.id, line);
    this.history.append({
      workspace_id: session.workspace_id,
      group_id: session.group_id,
      session_id: session.id,
      command,
    });
  }
}

import type { SessionModel } from "../models/session.js";
import type { ProcessRegistry } from "./process-registry.js";
import type { EventBus } from "./event-bus.js";
import type { PtyRuntime } from "./pty-runtime.js";
import { RuntimeError } from "../core/errors/app-error.js";
import {
  classifySession,
  isPidAlive,
  remoteSessionMessage,
  remoteTerminateSignal,
  type PidProbe,
  type SessionOwnership,
} from "./session-liveness.js";

export interface SessionRuntimeUpdatePort {
  updateRuntime(
    sessionId: string,
    patch: { pid?: number | null; owner_pid?: number | null; status: SessionModel["status"] },
  ): SessionModel;
}

export interface SessionRuntimeHost {
  selfPid: number;
  platform: NodeJS.Platform;
  isAlive: PidProbe;
  kill: (pid: number, signal: NodeJS.Signals) => void;
}

const defaultHost: SessionRuntimeHost = {
  selfPid: process.pid,
  platform: process.platform,
  isAlive: isPidAlive,
  kill: (pid, signal) => {
    process.kill(pid, signal);
  },
};

/**
 * Orchestrates PTY lifecycle for workspace sessions.
 *
 * PTY handles live only in this process; the shared DB records `pid` + `owner_pid` so other
 * processes can tell live sessions from stale rows and stop (but not drive) them.
 */
export class SessionRuntime {
  constructor(
    private readonly registry: ProcessRegistry,
    private readonly ptyRuntime: PtyRuntime,
    private readonly eventBus: EventBus,
    private readonly sessions: SessionRuntimeUpdatePort,
    private readonly host: SessionRuntimeHost = defaultHost,
  ) {}

  runtimeIdFor(sessionId: string): string {
    return `runtime-${sessionId}`;
  }

  async start(session: SessionModel, tool?: string): Promise<{ runtimeId: string; pid: number }> {
    const runtimeId = this.runtimeIdFor(session.id);
    const ownership = this.ownership(session);
    if (ownership.kind === "local") {
      throw new RuntimeError(`Session already running: ${session.name}`);
    }
    if (ownership.kind === "remote") {
      throw new RuntimeError(
        `Session already running in another ai-shelf process (pid ${String(ownership.ownerPid)}): ${session.name}`,
      );
    }

    const handle = await this.ptyRuntime.spawn(runtimeId, {
      cwd: session.cwd,
      shell: session.shell,
      tool: tool ?? session.tool ?? undefined,
      onData: () => {
        this.eventBus.publish({
          type: "SessionOutputReceived",
          payload: { sessionId: session.id },
        });
      },
      onExit: () => {
        // stop()/stopAllOwned() already recorded the stop; only natural exits land here.
        if (!this.registry.delete(runtimeId)) return;
        this.markStopped(session.id);
      },
    });

    this.registry.register({
      runtimeId,
      sessionId: session.id,
      pid: handle.pid,
      tool,
    });

    const updated = this.sessions.updateRuntime(session.id, {
      pid: handle.pid,
      owner_pid: this.host.selfPid,
      status: "running",
    });
    this.eventBus.publish({ type: "SessionStarted", payload: updated });
    return { runtimeId, pid: handle.pid };
  }

  /** Where the session's PTY lives from this process's point of view. */
  ownership(session: SessionModel): SessionOwnership {
    const record = this.registry.getBySessionId(session.id);
    return classifySession(session, {
      hasLocalHandle: record !== undefined && this.ptyRuntime.get(record.runtimeId) !== undefined,
      selfPid: this.host.selfPid,
      isAlive: this.host.isAlive,
    });
  }

  /** Mark a `running` row whose owner or PTY is gone as stopped; returns the fresh row. */
  reconcile(session: SessionModel): SessionModel {
    if (this.ownership(session).kind !== "stale") return session;
    return this.markStopped(session.id) ?? session;
  }

  /**
   * Stop a session's PTY: kill the local handle, or terminate a PTY owned by another live
   * process by pid. Stale rows are simply marked stopped.
   */
  stop(session: SessionModel): void {
    const ownership = this.ownership(session);
    switch (ownership.kind) {
      case "local": {
        const record = this.registry.getBySessionId(session.id);
        if (record) {
          this.registry.delete(record.runtimeId);
          this.ptyRuntime.kill(record.runtimeId);
        }
        break;
      }
      case "remote":
        try {
          this.host.kill(ownership.pid, remoteTerminateSignal(this.host.platform));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
            throw new RuntimeError(
              `Failed to stop session "${session.name}" (pid ${String(ownership.pid)})`,
              err,
            );
          }
        }
        break;
      case "stale":
        break;
      case "idle":
        throw new RuntimeError(
          `Session "${session.name}" is not running (status: ${session.status})`,
        );
    }
    this.markStopped(session.id);
  }

  /**
   * Kill every PTY spawned by this process and mark the sessions stopped. Called when the
   * owning CLI/TUI process exits so the shared DB never keeps phantom `running` rows.
   */
  stopAllOwned(): number {
    const records = this.registry.list();
    for (const record of records) {
      this.registry.delete(record.runtimeId);
      this.ptyRuntime.kill(record.runtimeId);
      this.markStopped(record.sessionId);
    }
    return records.length;
  }

  write(session: SessionModel, data: string): void {
    const ownership = this.ownership(session);
    if (ownership.kind === "remote") {
      throw new RuntimeError(remoteSessionMessage(session.name, ownership.ownerPid));
    }
    const record = this.registry.getBySessionId(session.id);
    if (ownership.kind !== "local" || !record) {
      throw new RuntimeError(`Session "${session.name}" is not running`);
    }
    this.ptyRuntime.write(record.runtimeId, data);
  }

  getPreview(sessionId: string, maxChars?: number): string {
    const record = this.registry.getBySessionId(sessionId);
    if (!record) return "";
    return this.ptyRuntime.getPreview(record.runtimeId, maxChars);
  }

  private markStopped(sessionId: string): SessionModel | null {
    let updated: SessionModel;
    try {
      updated = this.sessions.updateRuntime(sessionId, {
        pid: null,
        owner_pid: null,
        status: "stopped",
      });
    } catch {
      // The DB may already be closed (e.g. a PTY exiting during shutdown) or the row deleted.
      return null;
    }
    this.eventBus.publish({ type: "SessionStopped", payload: updated });
    return updated;
  }
}

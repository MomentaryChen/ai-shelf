import type { SessionModel } from "../models/session.js";
import type { ProcessRegistry } from "./process-registry.js";
import type { EventBus } from "./event-bus.js";
import type { PtyRuntime } from "./pty-runtime.js";
import { RuntimeError } from "../core/errors/app-error.js";

export interface SessionRuntimeUpdatePort {
  updateRuntime(
    sessionId: string,
    patch: { pid?: number | null; status: SessionModel["status"] },
  ): SessionModel;
}

/**
 * Orchestrates PTY lifecycle for workspace sessions.
 */
export class SessionRuntime {
  constructor(
    private readonly registry: ProcessRegistry,
    private readonly ptyRuntime: PtyRuntime,
    private readonly eventBus: EventBus,
    private readonly sessions: SessionRuntimeUpdatePort,
  ) {}

  runtimeIdFor(sessionId: string): string {
    return `runtime-${sessionId}`;
  }

  async start(session: SessionModel, tool?: string): Promise<{ runtimeId: string; pid: number }> {
    const runtimeId = this.runtimeIdFor(session.id);
    const existing = this.registry.get(runtimeId);
    if (existing && this.ptyRuntime.get(runtimeId)) {
      throw new RuntimeError(`Session already running: ${session.name}`);
    }

    const handle = await this.ptyRuntime.spawn(runtimeId, {
      cwd: session.cwd,
      shell: session.shell,
      tool: tool ?? session.tool ?? undefined,
      onData: () => {
        this.eventBus.publish({ type: "SessionOutputReceived", payload: { sessionId: session.id } });
      },
      onExit: () => {
        this.registry.delete(runtimeId);
        const updated = this.sessions.updateRuntime(session.id, { pid: null, status: "stopped" });
        this.eventBus.publish({ type: "SessionStopped", payload: updated });
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
      status: "running",
    });
    this.eventBus.publish({ type: "SessionStarted", payload: updated });
    return { runtimeId, pid: handle.pid };
  }

  stop(sessionId: string): void {
    const record = this.registry.getBySessionId(sessionId);
    if (!record) {
      throw new RuntimeError(`No running session: ${sessionId}`);
    }
    this.ptyRuntime.kill(record.runtimeId);
    this.registry.delete(record.runtimeId);
    const updated = this.sessions.updateRuntime(sessionId, { pid: null, status: "stopped" });
    this.eventBus.publish({ type: "SessionStopped", payload: updated });
  }

  write(sessionId: string, data: string): void {
    const record = this.registry.getBySessionId(sessionId);
    if (!record) throw new RuntimeError(`Session not running: ${sessionId}`);
    this.ptyRuntime.write(record.runtimeId, data);
  }

  getPreview(sessionId: string, maxChars?: number): string {
    const record = this.registry.getBySessionId(sessionId);
    if (!record) return "";
    return this.ptyRuntime.getPreview(record.runtimeId, maxChars);
  }
}

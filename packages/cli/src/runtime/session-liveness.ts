import type { SessionModel } from "../models/session.js";

/** Returns true when a process with this pid currently exists. */
export type PidProbe = (pid: number) => boolean;

/**
 * Where a session's PTY lives, as seen from the current process.
 *
 * - `local`: this process spawned it and still holds the handle.
 * - `remote`: another live process (CLI, TUI or desktop app) owns a live PTY.
 * - `stale`: the DB says `running` but the owner or the PTY is gone; the row should be
 *   marked `stopped`.
 * - `idle`: not running.
 */
export type SessionOwnership =
  | { kind: "local" }
  | { kind: "remote"; pid: number; ownerPid: number }
  | { kind: "stale" }
  | { kind: "idle" };

export interface ClassifyOptions {
  /** This process holds a live PTY handle for the session. */
  hasLocalHandle: boolean;
  /** `process.pid` of the caller. */
  selfPid: number;
  isAlive: PidProbe;
}

/** Signal-0 probe; EPERM means the process exists but belongs to another user. */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Decide whether a session marked `running` in the shared DB is really running, and where.
 *
 * Rows without an `owner_pid` (written before owner tracking existed) cannot be verified,
 * so they are treated as stale rather than risking a kill of a recycled pid.
 */
export function classifySession(
  session: Pick<SessionModel, "status" | "pid" | "owner_pid">,
  opts: ClassifyOptions,
): SessionOwnership {
  if (opts.hasLocalHandle) return { kind: "local" };
  if (session.status !== "running") return { kind: "idle" };
  const { pid, owner_pid: ownerPid } = session;
  if (pid === null || ownerPid === null) return { kind: "stale" };
  // We claim ownership but have no handle: the PTY exited without us recording it.
  if (ownerPid === opts.selfPid) return { kind: "stale" };
  if (!opts.isAlive(ownerPid) || !opts.isAlive(pid)) return { kind: "stale" };
  return { kind: "remote", pid, ownerPid };
}

/**
 * Signal used to end a PTY owned by another process. Interactive POSIX shells ignore
 * SIGTERM, so hang them up like a closed terminal would; on Windows the signal name is
 * ignored and `process.kill` terminates the process.
 */
export function remoteTerminateSignal(platform: NodeJS.Platform): NodeJS.Signals {
  return platform === "win32" ? "SIGTERM" : "SIGHUP";
}

export function remoteSessionMessage(sessionName: string, ownerPid: number): string {
  return (
    `Session "${sessionName}" is running in another ai-shelf process (pid ${String(ownerPid)}); ` +
    "exec only works from the process that started it. " +
    "Start and drive the session from `ai-shelf tui` to send commands to it."
  );
}

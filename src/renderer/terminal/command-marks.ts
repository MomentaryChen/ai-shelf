/**
 * OSC 133 shell command marks — pure state (no xterm / DOM), unit tested.
 *
 * Shell integration emits, per command:
 *   A  prompt start · B  input start (prompt end) · C  output start · D;<exit>  finished
 * Markers are generic (`M`) so tests can use plain objects; the xterm wiring
 * (xterm-command-marks.ts) passes `IMarker`s and resolves their live line.
 */

export type Osc133Mark =
  | { kind: "A" }
  | { kind: "B" }
  | { kind: "C" }
  | { kind: "D"; exitCode: number | null };

/** Parse an OSC 133 payload (`A`, `B`, `C`, `D`, `D;1`, `A;cl=m`…). Unknown kinds → null. */
export function parseOsc133(data: string): Osc133Mark | null {
  const parts = data.split(";");
  switch (parts[0]) {
    case "A":
    case "B":
    case "C":
      return { kind: parts[0] };
    case "D": {
      const raw = parts[1]?.trim() ?? "";
      const exitCode = /^-?\d+$/.test(raw) ? Number(raw) : null;
      return { kind: "D", exitCode };
    }
    default:
      return null;
  }
}

/** Where a mark landed: a buffer marker plus the cursor column at that moment. */
export interface MarkPoint<M> {
  marker: M;
  col: number;
}

export interface CommandEntry<M> {
  prompt?: MarkPoint<M>;
  input?: MarkPoint<M>;
  output?: MarkPoint<M>;
  end?: MarkPoint<M>;
  /** `null` when unknown (e.g. marks re-parsed from a replayed backlog). */
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  /** C received — the command line was submitted and output began. */
  started: boolean;
  finished: boolean;
  /** Finished after actually running (C seen or an exit code reported). */
  ran: boolean;
}

export interface LastCommandStatus {
  /** `null` when the shell did not report a code. */
  exitCode: number | null;
  /** `null` when start or end time is unknown. */
  durationMs: number | null;
}

/** Resolve a marker to its current buffer line, or -1 when trimmed / disposed. */
export type LineOf<M> = (marker: M) => number;

export interface LineRange {
  startLine: number;
  /** Inclusive last line. */
  endLine: number;
  /** Exclusive end column on `endLine`; undefined = whole line. */
  endCol?: number;
}

export interface CommandMarkTrackerOptions<M> {
  dispose: (marker: M) => void;
  /** Max commands kept (older markers are disposed). */
  maxCommands?: number;
}

const DEFAULT_MAX_COMMANDS = 500;

function pointsOf<M>(e: CommandEntry<M>): MarkPoint<M>[] {
  return [e.prompt, e.input, e.output, e.end].filter((p): p is MarkPoint<M> => Boolean(p));
}

function newEntry<M>(): CommandEntry<M> {
  return {
    startedAt: null,
    endedAt: null,
    exitCode: null,
    started: false,
    finished: false,
    ran: false,
  };
}

export class CommandMarkTracker<M> {
  readonly commands: CommandEntry<M>[] = [];
  /** True once any OSC 133 mark arrived (shell integration is active). */
  seen = false;
  private readonly dispose: (marker: M) => void;
  private readonly max: number;

  constructor(opts: CommandMarkTrackerOptions<M>) {
    this.dispose = opts.dispose;
    this.max = Math.max(1, opts.maxCommands ?? DEFAULT_MAX_COMMANDS);
  }

  private get current(): CommandEntry<M> | undefined {
    return this.commands[this.commands.length - 1];
  }

  private replacePoint(e: CommandEntry<M>, key: "prompt" | "input" | "output" | "end", p: MarkPoint<M> | null) {
    const old = e[key];
    if (old) this.dispose(old.marker);
    if (p) e[key] = p;
    else delete e[key];
  }

  private push(e: CommandEntry<M>): CommandEntry<M> {
    this.commands.push(e);
    while (this.commands.length > this.max) {
      const dropped = this.commands.shift()!;
      for (const p of pointsOf(dropped)) this.dispose(p.marker);
    }
    return e;
  }

  /** Current command that has not started output yet (prompt / input phase). */
  private pendingPrompt(): CommandEntry<M> | undefined {
    const c = this.current;
    return c && !c.finished && !c.started ? c : undefined;
  }

  /**
   * Apply one mark. `point` is null when no marker could be placed (alt buffer).
   * `now` is null when the time is meaningless (replayed backlog).
   * Returns true when {@link lastStatus} may have changed.
   */
  apply(mark: Osc133Mark, point: MarkPoint<M> | null, now: number | null): boolean {
    this.seen = true;
    switch (mark.kind) {
      case "A": {
        const c = this.current;
        // Prompt redrawn (Ctrl+C, empty Enter, completion listing): move it, don't add a command.
        const pending = this.pendingPrompt();
        if (pending) {
          this.replacePoint(pending, "prompt", point);
          this.replacePoint(pending, "input", null);
          return false;
        }
        // Output started but no D arrived: close it without a code.
        if (c && !c.finished) c.finished = true;
        const e = this.push(newEntry<M>());
        if (point) e.prompt = point;
        return false;
      }
      case "B": {
        const pending = this.pendingPrompt();
        if (pending) {
          this.replacePoint(pending, "input", point);
          return false;
        }
        const c = this.current;
        if (c && !c.finished) c.finished = true;
        const e = this.push(newEntry<M>());
        if (point) e.input = point;
        return false;
      }
      case "C": {
        let e = this.pendingPrompt();
        if (!e) {
          const c = this.current;
          if (c && !c.finished) c.finished = true;
          e = this.push(newEntry<M>());
        }
        if (point) e.output = point;
        e.started = true;
        e.startedAt = now;
        return false;
      }
      case "D": {
        const c = this.current;
        let e: CommandEntry<M>;
        if (c && !c.finished) {
          e = c;
        } else {
          e = this.push(newEntry<M>());
        }
        // `D` without C or a code (e.g. after Ctrl+C at the prompt): nothing ran.
        e.ran = e.started || mark.exitCode !== null;
        if (point) this.replacePoint(e, "end", point);
        e.endedAt = e.ran ? now : null;
        e.exitCode = mark.exitCode;
        e.finished = true;
        return e.ran;
      }
    }
  }

  /** Last command that actually ran, or null. */
  lastStatus(): LastCommandStatus | null {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const e = this.commands[i]!;
      if (!e.ran) continue;
      const durationMs =
        e.startedAt !== null && e.endedAt !== null ? Math.max(0, e.endedAt - e.startedAt) : null;
      return { exitCode: e.exitCode, durationMs };
    }
    return null;
  }

  /** Sorted, de-duplicated live prompt lines (A, or B when A is missing). */
  promptLines(lineOf: LineOf<M>): number[] {
    const out = new Set<number>();
    for (const e of this.commands) {
      const p = e.prompt ?? e.input;
      if (!p) continue;
      const line = lineOf(p.marker);
      if (line >= 0) out.add(line);
    }
    return [...out].sort((a, b) => a - b);
  }

  /** Line range of the last finished command's output, or null when unknown / scrolled away. */
  lastOutputRange(lineOf: LineOf<M>): LineRange | null {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const e = this.commands[i]!;
      if (!e.finished || !e.started) continue;
      if (!e.output) return null;
      const outLine = lineOf(e.output.marker);
      if (outLine < 0) return null;
      // C emitted at the end of the input line → output begins on the next line.
      const startLine = e.output.col > 0 ? outLine + 1 : outLine;
      const endLine = e.end ? lineOf(e.end.marker) : -1;
      if (e.end && endLine >= 0) {
        return e.end.col > 0
          ? { startLine, endLine, endCol: e.end.col }
          : { startLine, endLine: endLine - 1 };
      }
      // No D marker: stop before the next prompt.
      const next = this.commands[i + 1];
      const np = next?.prompt ?? next?.input;
      const nextLine = np ? lineOf(np.marker) : -1;
      if (nextLine < 0) return null;
      return { startLine, endLine: nextLine - 1 };
    }
    return null;
  }

  /** Dispose every marker and forget all commands. */
  reset(): void {
    for (const e of this.commands) for (const p of pointsOf(e)) this.dispose(p.marker);
    this.commands.length = 0;
  }
}

/** Target line for prompt navigation from the viewport top, or null when none. */
export function findPromptLine(
  lines: readonly number[],
  viewportTop: number,
  direction: "prev" | "next",
): number | null {
  if (direction === "prev") {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i]! < viewportTop) return lines[i]!;
    return null;
  }
  for (const l of lines) if (l > viewportTop) return l;
  return null;
}

/** Compact duration for the status bar: `850ms`, `4.2s`, `37s`, `2m 05s`, `1h 03m`. */
export function formatCommandDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 10) return `${(Math.floor(s * 10) / 10).toFixed(1)}s`;
  if (s < 60) return `${Math.floor(s)}s`;
  const totalSec = Math.floor(s);
  const m = Math.floor(totalSec / 60);
  if (m < 60) return `${m}m ${String(totalSec % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

// ---------------------------------------------------------------------------
// Per-session status store (EmbeddedTerminal → TerminalStatusBar)
// ---------------------------------------------------------------------------

const statusBySession = new Map<string, LastCommandStatus>();
const statusListeners = new Set<() => void>();

export function getCommandStatus(sessionId: string | null | undefined): LastCommandStatus | null {
  return sessionId ? (statusBySession.get(sessionId) ?? null) : null;
}

export function setCommandStatus(sessionId: string, status: LastCommandStatus | null): void {
  const prev = statusBySession.get(sessionId);
  if (status === null) {
    if (!prev) return;
    statusBySession.delete(sessionId);
  } else {
    if (prev && prev.exitCode === status.exitCode && prev.durationMs === status.durationMs) return;
    statusBySession.set(sessionId, status);
  }
  for (const fn of statusListeners) fn();
}

export function subscribeCommandStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
}

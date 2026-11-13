import type { IMarker, Terminal } from "@xterm/xterm";
import {
  CommandMarkTracker,
  findPromptLine,
  parseOsc133,
  type LastCommandStatus,
  type LineRange,
} from "./command-marks";

export interface TerminalCommandMarks {
  /** Any OSC 133 mark received in this terminal (shell integration active). */
  hasMarks: () => boolean;
  /** Prompt navigation possible right now (marks exist, normal buffer). */
  canJump: () => boolean;
  /** Last finished command's output is still in the buffer. */
  canCopyLastOutput: () => boolean;
  /** Scroll to the previous / next prompt. Returns false when there is none. */
  jumpPrompt: (direction: "prev" | "next") => boolean;
  /** Text of the last finished command's output, or null when unavailable. */
  lastOutputText: () => string | null;
  /** Marks parsed while not live (replayed backlog) carry no timestamps. */
  setLive: (live: boolean) => void;
  /** False while the replayed backlog is parsed (side effects must not re-fire). */
  isLive: () => boolean;
  dispose: () => void;
}

export interface TerminalCommandMarksOptions {
  /**
   * Last finished command changed (`live`), or — once, when the replayed backlog
   * has been parsed — the status it contained (`live` false, durations unknown).
   */
  onStatus?: (status: LastCommandStatus | null, live: boolean) => void;
  now?: () => number;
  /** Current working directory (latest OSC 7), stamped on each command when it starts. */
  getCwd?: () => string | undefined;
  /** A command finished while live (not from the replayed backlog). */
  onCommandFinished?: (info: FinishedCommandInfo) => void;
}

export interface FinishedCommandInfo {
  id: number;
  /** Command line as typed (empty when it could not be read). */
  command: string;
  exitCode: number | null;
  durationMs: number | null;
  cwd?: string;
}

/** Longest command line kept per entry. */
const MAX_COMMAND_CHARS = 2000;

const lineOf = (m: IMarker) => (m.isDisposed ? -1 : m.line);

function isNormalBuffer(term: Terminal): boolean {
  return term.buffer.active.type === "normal";
}

/** Read `range` from the normal buffer; soft-wrapped rows join without a newline. */
function readRange(term: Terminal, range: LineRange): string {
  const buf = term.buffer.normal;
  const last = Math.min(range.endLine, buf.length - 1);
  let out = "";
  for (let y = Math.max(0, range.startLine); y <= last; y++) {
    const line = buf.getLine(y);
    if (!line) continue;
    const endCol = y === range.endLine ? range.endCol : undefined;
    const startCol = y === range.startLine ? (range.startCol ?? 0) : 0;
    const next = y < last ? buf.getLine(y + 1) : undefined;
    const joined = Boolean(next?.isWrapped);
    // Keep trailing cells of wrapped rows — they are part of the logical line.
    out += line.translateToString(!joined, startCol, endCol);
    if (y < last && !joined) out += "\n";
  }
  return out.replace(/\s+$/, "");
}

/**
 * Listen for OSC 133 (shell command marks) and record an xterm marker per
 * prompt / output boundary. Returns the actions and a dispose function.
 */
export function bindTerminalCommandMarks(
  term: Terminal,
  options: TerminalCommandMarksOptions = {},
): TerminalCommandMarks {
  const now = options.now ?? Date.now;
  let live = true;
  const tracker = new CommandMarkTracker<IMarker>({ dispose: (m) => m.dispose() });

  const osc133 = term.parser.registerOscHandler(133, (data) => {
    try {
      const mark = parseOsc133(data);
      if (!mark) return true;
      // Full-screen apps own the alternate buffer; markers there are meaningless.
      const marker = isNormalBuffer(term) ? term.registerMarker(0) : undefined;
      const point = marker ? { marker, col: term.buffer.active.cursorX } : null;
      const changed = tracker.apply(mark, point, live ? now() : null);
      const entry = tracker.latest();
      if (mark.kind === "C" && entry) {
        // The typed line sits between B and C; read it now, before output can scroll it away.
        const range = tracker.inputRange(entry, lineOf);
        const text = range ? readRange(term, range).trim() : "";
        if (text) entry.command = text.slice(0, MAX_COMMAND_CHARS);
        entry.cwd = options.getCwd?.();
      }
      if (changed && live) {
        options.onStatus?.(tracker.lastStatus(), true);
        if (entry?.ran) {
          options.onCommandFinished?.({
            id: entry.id,
            command: entry.command ?? "",
            exitCode: entry.exitCode,
            durationMs:
              entry.startedAt !== null && entry.endedAt !== null
                ? Math.max(0, entry.endedAt - entry.startedAt)
                : null,
            cwd: entry.cwd,
          });
        }
      }
    } catch (err) {
      console.warn("[osc133]", err);
    }
    // Consume the sequence so it never leaks into the buffer as text.
    return true;
  });

  const canJump = () => tracker.seen && isNormalBuffer(term) && tracker.promptLines(lineOf).length > 0;

  return {
    hasMarks: () => tracker.seen,
    canJump,
    canCopyLastOutput: () => tracker.seen && tracker.lastOutputRange(lineOf) !== null,
    jumpPrompt: (direction) => {
      if (!canJump()) return false;
      const lines = tracker.promptLines(lineOf);
      const top = term.buffer.active.viewportY;
      const target = findPromptLine(lines, top, direction);
      if (target === null) {
        if (direction === "next") {
          term.scrollToBottom();
          return true;
        }
        return false;
      }
      term.scrollToLine(target);
      return true;
    },
    lastOutputText: () => {
      const range = tracker.lastOutputRange(lineOf);
      return range ? readRange(term, range) : null;
    },
    setLive: (next) => {
      const wasReplaying = !live;
      live = next;
      if (next && wasReplaying) options.onStatus?.(tracker.lastStatus(), false);
    },
    isLive: () => live,
    dispose: () => {
      osc133.dispose();
      tracker.reset();
    },
  };
}

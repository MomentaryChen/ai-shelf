/**
 * Command history panel data — per-session sources (registered by each mounted
 * EmbeddedTerminal from its OSC 133 tracker) plus pure row building, unit tested.
 *
 * In memory only. Each pane's tracker keeps at most 500 commands; the source of
 * truth is the live tracker, so history survives a remount (the replayed backlog
 * re-creates the marks) but loses timestamps for commands from before it.
 */

export interface CommandHistoryItem {
  /** Tracker sequence id (unique within one terminal instance). */
  id: number;
  command: string;
  cwd?: string;
  exitCode: number | null;
  durationMs: number | null;
  /** Wall-clock finish time; null for commands parsed from a replayed backlog. */
  endedAt: number | null;
  /** The command's prompt is still in the scrollback. */
  canJump: boolean;
  /** The command's output is still in the scrollback. */
  hasOutput: boolean;
}

export interface CommandHistorySource {
  /** Finished commands, newest first. */
  list: () => CommandHistoryItem[];
  /** Scroll the terminal to the command's prompt. */
  jump: (id: number) => boolean;
  outputText: (id: number) => string | null;
}

const sources = new Map<string, CommandHistorySource>();
const listeners = new Set<() => void>();
let version = 0;

export function registerCommandHistorySource(
  sessionId: string,
  source: CommandHistorySource,
): () => void {
  sources.set(sessionId, source);
  notifyCommandHistoryChanged();
  return () => {
    if (sources.get(sessionId) === source) {
      sources.delete(sessionId);
      notifyCommandHistoryChanged();
    }
  };
}

export function getCommandHistorySource(sessionId: string): CommandHistorySource | undefined {
  return sources.get(sessionId);
}

export function notifyCommandHistoryChanged(): void {
  version += 1;
  for (const fn of listeners) fn();
}

export function subscribeCommandHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCommandHistoryVersion(): number {
  return version;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface CommandHistoryGroup {
  paneId: string;
  sessionId: string;
  /** Pane cwd used when a command carries no OSC 7 cwd. */
  fallbackCwd?: string;
  items: CommandHistoryItem[];
}

export interface CommandHistoryRow extends CommandHistoryItem {
  /** Unique across panes (React key). */
  key: string;
  paneId: string;
  sessionId: string;
}

/** Rows shown at most (newest first). */
export const HISTORY_DISPLAY_LIMIT = 200;

/** Every whitespace-separated term must appear in the command or cwd (case-insensitive). */
export function matchesHistoryQuery(item: Pick<CommandHistoryItem, "command" | "cwd">, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${item.command}\n${item.cwd ?? ""}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

/**
 * Merge per-pane histories (each newest first) into one list, newest first.
 * Commands with a finish time sort by it; replayed ones (no time) keep their
 * pane's order and go after timed ones.
 */
export function buildHistoryRows(
  groups: readonly CommandHistoryGroup[],
  query: string,
  limit = HISTORY_DISPLAY_LIMIT,
): CommandHistoryRow[] {
  const rows: (CommandHistoryRow & { order: number })[] = [];
  for (const g of groups) {
    g.items.forEach((item, order) => {
      const cwd = item.cwd ?? g.fallbackCwd;
      if (!matchesHistoryQuery({ command: item.command, cwd }, query)) return;
      rows.push({
        ...item,
        cwd,
        key: `${g.sessionId}:${item.id}`,
        paneId: g.paneId,
        sessionId: g.sessionId,
        order,
      });
    });
  }
  rows.sort((a, b) => {
    const ta = a.endedAt ?? -1;
    const tb = b.endedAt ?? -1;
    if (ta !== tb) return tb - ta;
    return a.order - b.order;
  });
  return rows.slice(0, Math.max(0, limit)).map(({ order: _order, ...row }) => row);
}

/**
 * Whether a captured command can be re-run or saved. Multi-line input is read
 * back from the screen with the shell's continuation prompts (`> `, `>> `)
 * mixed in; sending that again would run `>` redirects, so only single-line
 * commands qualify.
 */
export function isReplayableCommand(command: string): boolean {
  return command.trim().length > 0 && !/[\r\n]/.test(command);
}

/** Saved-command name from a command line: first line, capped. */
export function savedCommandNameFor(command: string, max = 40): string {
  const line = command.split(/\r?\n/)[0]!.trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

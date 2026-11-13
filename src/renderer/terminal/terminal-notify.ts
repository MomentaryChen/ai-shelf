/**
 * Terminal-originated desktop notifications — pure logic (no DOM / xterm), unit tested.
 *
 * Sources: a long OSC 133 command finishing, the BEL character, and the
 * OSC 9 (iTerm2 / ConEmu) and OSC 777 (`notify;title;body`, urxvt / foot)
 * notification sequences that CLIs emit.
 */

export type TerminalNotifyEvent =
  | {
      kind: "command";
      command: string;
      exitCode: number | null;
      durationMs: number | null;
    }
  | { kind: "bell" }
  | { kind: "osc"; title: string; body: string };

/** Longest title / body / command text shown in a notification. */
export const NOTIFY_TEXT_MAX = 120;

/** Strip control characters, collapse whitespace, cap length (program-supplied text). */
export function sanitizeNotifyText(raw: string, max = NOTIFY_TEXT_MAX): string {
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * OSC 9 payload → notification body, or null.
 * ConEmu / Windows Terminal overload OSC 9 with numeric subcommands
 * (`9;4;…` progress, `9;9;…` cwd); those are never notifications.
 */
export function parseOsc9(data: string): { title: string; body: string } | null {
  if (/^\d+(;|$)/.test(data)) return null;
  const body = sanitizeNotifyText(data);
  return body ? { title: "", body } : null;
}

/** OSC 777 `notify;title;body` (body may contain `;`), or null for other subcommands. */
export function parseOsc777(data: string): { title: string; body: string } | null {
  const parts = data.split(";");
  if (parts[0] !== "notify" || parts.length < 2) return null;
  const title = sanitizeNotifyText(parts[1] ?? "");
  const body = sanitizeNotifyText(parts.slice(2).join(";"));
  if (!title && !body) return null;
  return { title, body };
}

export interface NotifyFocusState {
  /** The terminal view is showing (app is in Terminal mode). */
  viewActive: boolean;
  windowFocused: boolean;
  focusedPaneId: string | null;
}

/** Only notify when the user cannot see the pane: other pane focused, or app not in front. */
export function isPaneUnattended(paneId: string, s: NotifyFocusState): boolean {
  return !s.viewActive || !s.windowFocused || s.focusedPaneId !== paneId;
}

/** Whether a finished command is long enough to notify about. */
export function isLongCommand(
  event: Extract<TerminalNotifyEvent, { kind: "command" }>,
  thresholdSec: number,
): boolean {
  if (event.durationMs === null) return false;
  return event.durationMs >= Math.max(0, thresholdSec) * 1000;
}

/** Minimum gap between notifications of one kind for one pane. */
export const NOTIFY_MIN_GAP_MS: Record<TerminalNotifyEvent["kind"], number> = {
  command: 1_000,
  bell: 30_000,
  osc: 5_000,
};

/** Cap across all panes and kinds: at most `max` notifications per `windowMs`. */
export const NOTIFY_BURST = { max: 4, windowMs: 10_000 };

/** Per-key minimum gap plus a global burst cap. */
export class NotifyRateLimiter {
  private readonly last = new Map<string, number>();
  private recent: number[] = [];

  constructor(private readonly burst = NOTIFY_BURST) {}

  allow(key: string, minGapMs: number, now: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < minGapMs) return false;
    this.recent = this.recent.filter((t) => now - t < this.burst.windowMs);
    if (this.recent.length >= this.burst.max) return false;
    this.last.set(key, now);
    this.recent.push(now);
    return true;
  }

  /** Forget a key (pane closed). */
  forget(prefix: string): void {
    for (const k of [...this.last.keys()]) if (k.startsWith(prefix)) this.last.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Cross-source dedupe (agent-status notifications vs terminal notifications)
// ---------------------------------------------------------------------------

export type PaneNotifySource = "agent" | "terminal";

/**
 * A pane already notified by the other source within this window is skipped:
 * a finished command (or a CLI's own OSC 9 / bell) and the agent "ready" /
 * "waiting" heuristics describe the same moment. Covers the agent's 8 s
 * idle-stable delay.
 */
export const CROSS_SOURCE_DEDUPE_MS = 30_000;

export class PaneNotifyDedupe {
  private readonly last = new Map<string, { source: PaneNotifySource; at: number }>();

  /** Record and return true unless the other source notified this pane recently. */
  claim(paneId: string, source: PaneNotifySource, now: number, windowMs = CROSS_SOURCE_DEDUPE_MS): boolean {
    const prev = this.last.get(paneId);
    if (prev && prev.source !== source && now - prev.at < windowMs) return false;
    this.last.set(paneId, { source, at: now });
    return true;
  }
}

/** Shared by usePaneAgentAwareness and useTerminalNotifications. */
export const paneNotifyDedupe = new PaneNotifyDedupe();

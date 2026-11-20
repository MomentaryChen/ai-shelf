/**
 * Attention inbox: a persistent queue of panes (any profile) waiting on the user.
 *
 * Pure state, fed by the same pane agent transitions as the background toasts.
 * Unlike the background attention map, entries survive a profile switch — they
 * only clear when the pane gets busy again, the user looks at it, or it closes.
 * The profile is not stored: panes move between the active and stashed profiles,
 * so the renderer resolves it when drawing.
 */

import type { PaneAgentStatus } from "./pane-agent-state.js";
import type { BackgroundAttentionKind } from "./background-agent-attention.js";

export type AttentionInboxKind = BackgroundAttentionKind;

export interface AttentionInboxEntry {
  kind: AttentionInboxKind;
  /** When the pane started needing attention (kept while the kind stays the same). */
  since: number;
  /** Last meaningful output line when the entry was created (may be empty). */
  line: string;
  /** Set when the error came from the PTY exiting (sticky until seen). */
  exitCode?: number;
}

/** Keyed by pane id. */
export type AttentionInboxMap = Partial<Record<string, AttentionInboxEntry>>;

export type AttentionInboxEvent =
  | {
      type: "status";
      paneId: string;
      next: PaneAgentStatus;
      at: number;
      line?: string;
      /** The user is looking at this pane right now — do not queue it. */
      viewing?: boolean;
    }
  | { type: "finished"; paneId: string; at: number; line?: string; viewing?: boolean }
  | { type: "exited"; paneId: string; exitCode: number; at: number; line?: string }
  /** The user focused / opened this pane. */
  | { type: "seen"; paneId: string }
  /** Keep only entries whose pane is still tracked (closed panes drop out). */
  | { type: "retain"; paneIds: ReadonlySet<string> };

function setEntry(
  map: AttentionInboxMap,
  paneId: string,
  kind: AttentionInboxKind,
  at: number,
  line: string | undefined,
  exitCode?: number,
): AttentionInboxMap {
  const prev = map[paneId];
  if (prev && prev.kind === kind && prev.exitCode === exitCode) {
    // Same reason repeating: keep the original wait start, refresh the line if we got one.
    if (!line || line === prev.line) return map;
    return { ...map, [paneId]: { ...prev, line } };
  }
  const entry: AttentionInboxEntry = { kind, since: at, line: line ?? prev?.line ?? "" };
  if (exitCode !== undefined) entry.exitCode = exitCode;
  return { ...map, [paneId]: entry };
}

function deleteEntry(map: AttentionInboxMap, paneId: string): AttentionInboxMap {
  if (!(paneId in map)) return map;
  const next = { ...map };
  delete next[paneId];
  return next;
}

/** Returns the same map reference when nothing changed. */
export function reduceAttentionInbox(
  map: AttentionInboxMap,
  event: AttentionInboxEvent,
): AttentionInboxMap {
  switch (event.type) {
    case "status": {
      const { paneId, next, at, line, viewing } = event;
      if (next === "running") return deleteEntry(map, paneId);
      if (next === "waiting_input") {
        return viewing
          ? deleteEntry(map, paneId)
          : setEntry(map, paneId, "waiting_input", at, line);
      }
      if (next === "stalled") {
        return viewing ? deleteEntry(map, paneId) : setEntry(map, paneId, "error", at, line);
      }
      // idle: a prompt / stall resolved; "finished" and exit errors stay until seen.
      const prev = map[paneId];
      if (!prev) return map;
      if (prev.kind === "waiting_input") return deleteEntry(map, paneId);
      if (prev.kind === "error" && prev.exitCode === undefined) return deleteEntry(map, paneId);
      return map;
    }
    case "finished": {
      if (event.viewing) return map;
      const prev = map[event.paneId];
      // An exit error is sticky — a later "ready" must not hide it.
      if (prev?.kind === "error" && prev.exitCode !== undefined) return map;
      return setEntry(map, event.paneId, "finished", event.at, event.line);
    }
    case "exited": {
      if (event.exitCode === 0) return map;
      return setEntry(map, event.paneId, "error", event.at, event.line, event.exitCode);
    }
    case "seen":
      return deleteEntry(map, event.paneId);
    case "retain": {
      let next = map;
      for (const paneId of Object.keys(map)) {
        if (!event.paneIds.has(paneId)) next = deleteEntry(next, paneId);
      }
      return next;
    }
  }
}

const KIND_ORDER: Record<AttentionInboxKind, number> = {
  waiting_input: 0,
  error: 1,
  finished: 2,
};

export interface AttentionInboxItem extends AttentionInboxEntry {
  paneId: string;
}

/**
 * Queue order: panes blocked on the user first (waiting for input, then errors,
 * then finished), oldest first within a kind; pane id breaks ties.
 */
export function sortAttentionInbox(map: AttentionInboxMap): AttentionInboxItem[] {
  const items: AttentionInboxItem[] = [];
  for (const [paneId, entry] of Object.entries(map)) {
    if (entry) items.push({ paneId, ...entry });
  }
  items.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.since - b.since ||
      (a.paneId < b.paneId ? -1 : a.paneId > b.paneId ? 1 : 0),
  );
  return items;
}

/** Pane to jump to next: the head of the queue, skipping the pane already in front of the user. */
export function nextAttentionPaneId(
  items: readonly Pick<AttentionInboxItem, "paneId">[],
  currentPaneId: string | null,
): string | null {
  for (const item of items) {
    if (item.paneId !== currentPaneId) return item.paneId;
  }
  return null;
}

const MAX_LINE_CHARS = 160;
/** Lines made only of box drawing, spinners, prompt marks, bullets and whitespace. */
const DECORATION_ONLY = /^[\s─-╿▀-▟■-◿⠀-⣿>❯›$#%·•…\-=_*|+~`'".,:;!?()[\]{}<]*$/;

/**
 * Last line of terminal output worth showing as a preview: ANSI-free tail in,
 * trailing prompt chrome / box drawing / spinner lines skipped, truncated.
 */
export function lastMeaningfulLine(tail: string, maxChars = MAX_LINE_CHARS): string {
  if (!tail) return "";
  const lines = tail.split(/\r?\n|\r/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const cleaned = lines[i]!// Strip leading/trailing box frame characters (TUI boxes: "│ text │").
    .replace(/^[\s─-╿]+|[\s─-╿]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || DECORATION_ONLY.test(cleaned)) continue;
    // Require at least one letter or digit in any script.
    if (!/[\p{L}\p{N}]/u.test(cleaned)) continue;
    return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars - 1)}…` : cleaned;
  }
  return "";
}

export type WaitDurationUnit = "now" | "s" | "m" | "h";

/** Coarse "waiting for" duration: <5s "now", seconds under a minute, minutes under an hour, hours. */
export function waitDuration(ms: number): { unit: WaitDurationUnit; value: number } {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return { unit: "now", value: 0 };
  if (s < 60) return { unit: "s", value: s };
  const m = Math.floor(s / 60);
  if (m < 60) return { unit: "m", value: m };
  return { unit: "h", value: Math.floor(m / 60) };
}

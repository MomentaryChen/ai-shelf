/**
 * Attention tracking for agent panes that live in background (non-active) profiles.
 *
 * Pure state: the renderer feeds pane status transitions / PTY exits in and reads
 * a per-profile summary back for sidebar badges. Entries for panes that are no
 * longer in the background set (profile activated, pane closed) are pruned.
 */

import type { PaneAgentStatus } from "./pane-agent-state.js";

export type BackgroundAttentionKind = "waiting_input" | "finished" | "error";

export interface BackgroundAttentionEntry {
  profileId: string;
  kind: BackgroundAttentionKind;
  /** Set when the error came from the PTY exiting (sticky until viewed). */
  exitCode?: number;
  at: number;
}

/** Keyed by pane id. */
export type BackgroundAttentionMap = Partial<Record<string, BackgroundAttentionEntry>>;

export interface BackgroundProfileAttention {
  kind: BackgroundAttentionKind;
  count: number;
}

export type BackgroundAttentionEvent =
  | {
      type: "status";
      paneId: string;
      profileId: string;
      next: PaneAgentStatus;
      at: number;
    }
  | { type: "finished"; paneId: string; profileId: string; at: number }
  | { type: "exited"; paneId: string; profileId: string; exitCode: number; at: number }
  /** Keep only entries whose pane is still in a background profile. */
  | { type: "retain"; paneIds: ReadonlySet<string> };

const KIND_PRIORITY: Record<BackgroundAttentionKind, number> = {
  finished: 1,
  waiting_input: 2,
  error: 3,
};

function setEntry(
  map: BackgroundAttentionMap,
  paneId: string,
  entry: BackgroundAttentionEntry,
): BackgroundAttentionMap {
  const prev = map[paneId];
  if (
    prev &&
    prev.kind === entry.kind &&
    prev.profileId === entry.profileId &&
    prev.exitCode === entry.exitCode
  ) {
    return map;
  }
  return { ...map, [paneId]: entry };
}

function deleteEntry(map: BackgroundAttentionMap, paneId: string): BackgroundAttentionMap {
  if (!(paneId in map)) return map;
  return Object.fromEntries(Object.entries(map).filter(([id]) => id !== paneId));
}

/** Returns the same map reference when nothing changed. */
export function reduceBackgroundAttention(
  map: BackgroundAttentionMap,
  event: BackgroundAttentionEvent,
): BackgroundAttentionMap {
  switch (event.type) {
    case "status": {
      const { paneId, profileId, next, at } = event;
      if (next === "waiting_input") {
        return setEntry(map, paneId, { profileId, kind: "waiting_input", at });
      }
      if (next === "stalled") {
        return setEntry(map, paneId, { profileId, kind: "error", at });
      }
      if (next === "running") {
        // Agent resumed on its own — earlier attention is stale.
        return deleteEntry(map, paneId);
      }
      // idle: prompt / stall resolved; keep "finished" and exit errors.
      const prev = map[paneId];
      if (!prev) return map;
      if (prev.kind === "waiting_input") return deleteEntry(map, paneId);
      if (prev.kind === "error" && prev.exitCode === undefined) return deleteEntry(map, paneId);
      return map;
    }
    case "finished": {
      const prev = map[event.paneId];
      // An exit error is sticky — a later "ready" must not hide it.
      if (prev?.kind === "error" && prev.exitCode !== undefined) return map;
      return setEntry(map, event.paneId, {
        profileId: event.profileId,
        kind: "finished",
        at: event.at,
      });
    }
    case "exited": {
      if (event.exitCode === 0) return map;
      return setEntry(map, event.paneId, {
        profileId: event.profileId,
        kind: "error",
        exitCode: event.exitCode,
        at: event.at,
      });
    }
    case "retain": {
      let next = map;
      for (const paneId of Object.keys(map)) {
        if (!event.paneIds.has(paneId)) next = deleteEntry(next, paneId);
      }
      return next;
    }
  }
}

/**
 * Add a notice (toast) for a pane, replacing any earlier one for the same pane,
 * newest last, keeping at most `max`.
 */
export function enqueuePaneNotice<T extends { paneId: string }>(
  list: readonly T[],
  notice: T,
  max = 3,
): T[] {
  const next = list.filter((n) => n.paneId !== notice.paneId);
  next.push(notice);
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Highest-priority kind among the given values (error > waiting_input > finished). */
export function strongestAttention(
  kinds: Iterable<BackgroundAttentionKind | null | undefined>,
): BackgroundAttentionKind | null {
  let best: BackgroundAttentionKind | null = null;
  for (const kind of kinds) {
    if (kind && (!best || KIND_PRIORITY[kind] > KIND_PRIORITY[best])) best = kind;
  }
  return best;
}

/** Per-profile badge summary: highest-priority kind + number of panes needing attention. */
export function summarizeBackgroundAttention(
  map: BackgroundAttentionMap,
): Partial<Record<string, BackgroundProfileAttention>> {
  const out: Partial<Record<string, BackgroundProfileAttention>> = {};
  for (const entry of Object.values(map)) {
    if (!entry) continue;
    const cur = out[entry.profileId];
    if (!cur) {
      out[entry.profileId] = { kind: entry.kind, count: 1 };
      continue;
    }
    cur.count += 1;
    if (KIND_PRIORITY[entry.kind] > KIND_PRIORITY[cur.kind]) cur.kind = entry.kind;
  }
  return out;
}

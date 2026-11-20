import type { PaneInfo } from "./split-tree.js";

/**
 * Terminals kept mounted while off screen.
 *
 * Remounting a pane rebuilds xterm, creates a new WebGL context and replays the
 * whole PTY backlog (up to several MB of raw TUI output — ~100 ms of parsing per
 * busy Claude pane). Switching profile or swapping the displayed pane did that
 * for every pane at once, during the switch animation. A kept terminal stays
 * mounted (parked off screen) and its DOM node is moved back instead.
 */

/** Parked (off-screen) terminals kept beyond the ones on screen. */
export const MAX_PARKED_TERMINALS = 12;

export type KeptTerminalSelection = {
  /** Panes to keep mounted, in input order, one per session. */
  panes: PaneInfo[];
  /** Updated last-shown ticks (sessions no longer live are dropped). */
  lastShown: Map<string, number>;
};

/**
 * Pick the sessions whose xterm stays mounted.
 *
 * - On-screen sessions are always kept.
 * - A session is kept off screen only after it was shown once, so panes that
 *   were never opened (minimized at restore, other profiles) cost nothing.
 * - Excluded panes (shown in a view window) are never kept: two xterms on one
 *   session would both answer terminal queries.
 * - Off-screen sessions beyond `maxParked` go least recently shown first.
 */
export function selectKeptTerminals(input: {
  livePanes: Iterable<PaneInfo>;
  shownSessionIds: ReadonlySet<string>;
  excludedPaneIds: ReadonlySet<string>;
  lastShown: ReadonlyMap<string, number>;
  tick: number;
  maxParked?: number;
}): KeptTerminalSelection {
  const maxParked = input.maxParked ?? MAX_PARKED_TERMINALS;
  const unique: PaneInfo[] = [];
  const seen = new Set<string>();
  for (const pane of input.livePanes) {
    if (seen.has(pane.sessionId)) continue;
    seen.add(pane.sessionId);
    unique.push(pane);
  }

  const lastShown = new Map<string, number>();
  for (const pane of unique) {
    const sid = pane.sessionId;
    if (input.shownSessionIds.has(sid)) lastShown.set(sid, input.tick);
    else {
      const prev = input.lastShown.get(sid);
      if (prev !== undefined) lastShown.set(sid, prev);
    }
  }

  const parked = unique
    .filter(
      (p) =>
        !input.shownSessionIds.has(p.sessionId) &&
        !input.excludedPaneIds.has(p.id) &&
        lastShown.has(p.sessionId),
    )
    .sort((a, b) => lastShown.get(b.sessionId)! - lastShown.get(a.sessionId)!)
    .slice(0, Math.max(0, maxParked));
  const keepParked = new Set(parked.map((p) => p.sessionId));

  const panes = unique.filter(
    (p) =>
      !input.excludedPaneIds.has(p.id) &&
      (input.shownSessionIds.has(p.sessionId) || keepParked.has(p.sessionId)),
  );
  return { panes, lastShown };
}

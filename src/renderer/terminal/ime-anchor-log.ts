/**
 * Post-hoc record of where the CJK IME was anchored in each terminal.
 *
 * The misplacement this guards against is intermittent and tied to window /
 * pane switching, so there is rarely a live debugger attached when it happens.
 * This keeps a small ring buffer the user can dump from DevTools afterwards:
 *
 *   copy(__aiShelfImeAnchorLog())
 *
 * An entry whose `source` is not `"caret"`, or whose position is far from
 * `hardware`, identifies which fallback path ran for that composition.
 *
 * The console side prints every fallback, plus the *first* caret hit per
 * session. That asymmetry is deliberate: a console with no
 * `caret found (first)` line is a session where `findCaretCell` never matched
 * once, which means the Ink caret anchor is inert and the IME is riding
 * xterm's hardware cursor after all. Printing only fallbacks hid exactly that
 * — it had to be inferred from `hardware` appearing where `last-known` would
 * have, since `lastCaret` is only ever set from a caret hit.
 */

import type { ImeAnchor } from "./xterm-ime-anchor";

export type ImeAnchorLogEntry = ImeAnchor & {
  sessionId: string;
  at: string;
  /** Consecutive identical anchors are collapsed into one entry. */
  count: number;
};

const MAX_ENTRIES = 200;
const entries: ImeAnchorLogEntry[] = [];
/** Sessions that have found the Ink caret at least once. */
const caretSeen = new Set<string>();

const sameAnchor = (a: ImeAnchorLogEntry, b: ImeAnchor, sessionId: string): boolean =>
  a.sessionId === sessionId &&
  a.source === b.source &&
  a.col === b.col &&
  a.row === b.row &&
  a.hardware.col === b.hardware.col &&
  a.hardware.row === b.hardware.row;

export function recordImeAnchor(sessionId: string, anchor: ImeAnchor): void {
  const last = entries[entries.length - 1];
  if (last && sameAnchor(last, anchor, sessionId)) {
    last.count += 1;
    return;
  }

  entries.push({
    ...anchor,
    sessionId,
    at: new Date().toISOString(),
    count: 1,
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  if (anchor.source !== "caret") {
    console.debug(
      `[ime-anchor] ${sessionId} ${anchor.source} at ${anchor.col},${anchor.row} ` +
        `(hardware ${anchor.hardware.col},${anchor.hardware.row})`,
    );
  } else if (!caretSeen.has(sessionId)) {
    caretSeen.add(sessionId);
    console.debug(
      `[ime-anchor] ${sessionId} caret found (first) at ${anchor.col},${anchor.row} ` +
        `(hardware ${anchor.hardware.col},${anchor.hardware.row})`,
    );
  }
}

export function getImeAnchorLog(): ImeAnchorLogEntry[] {
  return entries.map((e) => ({ ...e }));
}

export function clearImeAnchorLog(): void {
  entries.length = 0;
  caretSeen.clear();
}

declare global {
  interface Window {
    __aiShelfImeAnchorLog?: () => ImeAnchorLogEntry[];
  }
}

if (typeof window !== "undefined") {
  window.__aiShelfImeAnchorLog = getImeAnchorLog;
}

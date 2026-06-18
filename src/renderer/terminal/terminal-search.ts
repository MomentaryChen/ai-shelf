import type { Terminal } from "@xterm/xterm";
import type { IBufferRange } from "@xterm/xterm";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import { MATCH_COUNT_CAP, type PtyTextMatch } from "../../shared/pty-output-search";

/** Internal 3rd arg on findNext/findPrevious (not in public .d.ts). */
interface InternalSearchOptions {
  noScroll?: boolean;
}

const SEARCH_DEBOUNCE_MS = 120;

export { MATCH_COUNT_CAP };

/** Align with main process PTY_OUTPUT_BUFFERS rolling tail. */
export const XTERM_SCROLLBACK_LINES = 20_000;

export interface TerminalMatch {
  line: number;
  col: number;
  size: number;
}

export type MatchScrollStatus = "ok" | "out-of-scrollback";

export interface ResolvedSessionMatch {
  pty: TerminalMatch;
  lineText: string;
  xterm: TerminalMatch | null;
}

export interface SearchSnapshot {
  session: ResolvedSessionMatch[];
  sessionCapped: boolean;
}

export function searchOptions(
  caseSensitive: boolean,
  incremental = false,
): ISearchOptions {
  return {
    caseSensitive,
    incremental,
  };
}

export function attachTerminalSearch(term: Terminal): SearchAddon {
  const addon = new SearchAddon({ highlightLimit: 0 });
  term.loadAddon(addon);
  return addon;
}

export function clearTerminalSearch(addon: SearchAddon | null): void {
  addon?.clearDecorations();
}

function sortTerminalMatches(matches: TerminalMatch[]): TerminalMatch[] {
  return [...matches].sort((a, b) => a.line - b.line || a.col - b.col);
}

function rangeToMatch(term: Terminal, range: IBufferRange): TerminalMatch {
  if (range.start.y === range.end.y) {
    return {
      line: range.start.y,
      col: range.start.x,
      size: range.end.x - range.start.x,
    };
  }
  const size =
    (range.end.y - range.start.y) * term.cols + range.end.x - range.start.x;
  return { line: range.start.y, col: range.start.x, size };
}

/** Collect all matches using @xterm/addon-search (same engine as VS Code terminal). */
export function collectAllMatchesViaAddon(
  addon: SearchAddon,
  term: Terminal,
  query: string,
  caseSensitive: boolean,
): { matches: TerminalMatch[]; capped: boolean } {
  if (!query) return { matches: [], capped: false };

  const opts = searchOptions(caseSensitive);
  addon.clearDecorations();
  term.clearSelection();

  const matches: TerminalMatch[] = [];
  const seen = new Set<string>();
  let capped = false;

  for (let i = 0; i < MATCH_COUNT_CAP; i++) {
    if (!addon.findNext(query, opts, { noScroll: true })) {
      break;
    }
    const range = term.getSelectionPosition();
    if (!range) {
      break;
    }
    const m = rangeToMatch(term, range);
    const key = `${m.line}:${m.col}:${m.size}`;
    if (seen.has(key)) {
      break;
    }
    seen.add(key);
    matches.push(m);
  }

  term.clearSelection();
  addon.clearDecorations();

  if (matches.length >= MATCH_COUNT_CAP) {
    capped = true;
  }

  return { matches: sortTerminalMatches(matches), capped };
}

/** Fallback when SearchAddon finds nothing (per-row translateToString). */
function collectFallbackLineMatches(
  term: Terminal,
  query: string,
  caseSensitive: boolean,
): TerminalMatch[] {
  const buffer = term.buffer.active;
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: TerminalMatch[] = [];

  for (let y = 0; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;
    const text = line.translateToString(true);
    if (!text) continue;
    const haystack = caseSensitive ? text : text.toLowerCase();
    let idx = 0;
    while (idx <= haystack.length) {
      const at = haystack.indexOf(needle, idx);
      if (at < 0) break;
      matches.push({ line: y, col: at, size: query.length });
      if (matches.length >= MATCH_COUNT_CAP) return matches;
      idx = at + 1;
    }
  }

  return matches;
}

/**
 * Jump to the Nth match (1-based) via SearchAddon — scroll + select like VS Code.
 */
export function jumpToMatchViaAddon(
  addon: SearchAddon,
  term: Terminal,
  index: number,
  query: string,
  caseSensitive: boolean,
): boolean {
  if (!query || index < 1) return false;

  const opts = searchOptions(caseSensitive);
  addon.clearDecorations();
  term.clearSelection();

  for (let i = 0; i < index - 1; i++) {
    if (!addon.findNext(query, opts, { noScroll: true })) {
      term.clearSelection();
      return false;
    }
  }

  const found = addon.findNext(query, opts);
  if (!found) {
    term.clearSelection();
  }
  return found;
}

export async function buildSearchSnapshot(
  _sessionId: string,
  term: Terminal | null,
  query: string,
  caseSensitive: boolean,
  addon: SearchAddon | null,
): Promise<SearchSnapshot> {
  if (!term || !query) {
    return { session: [], sessionCapped: false };
  }

  if (!addon) {
    return { session: [], sessionCapped: false };
  }

  let { matches, capped } = collectAllMatchesViaAddon(
    addon,
    term,
    query,
    caseSensitive,
  );

  if (matches.length === 0) {
    matches = collectFallbackLineMatches(term, query, caseSensitive);
    capped = matches.length >= MATCH_COUNT_CAP;
  }

  const session: ResolvedSessionMatch[] = matches.map((m) => ({
    pty: m,
    lineText: "",
    xterm: m,
  }));

  return { session, sessionCapped: capped };
}

/** Scroll-only jump using coordinates from SearchAddon selection. */
export function jumpToSessionMatch(
  term: Terminal,
  entry: ResolvedSessionMatch,
  query: string,
  caseSensitive: boolean,
  addon: SearchAddon | null,
  matchIndex: number,
): MatchScrollStatus {
  if (!query || !addon) {
    term.clearSelection();
    return "out-of-scrollback";
  }

  if (jumpToMatchViaAddon(addon, term, matchIndex, query, caseSensitive)) {
    return "ok";
  }

  const fallback = entry.xterm;
  if (fallback) {
    const buffer = term.buffer.active;
    const vy = buffer.viewportY;
    const half = Math.floor(term.rows / 2);
    const targetY = Math.max(0, fallback.line - half);
    if (fallback.line < vy) {
      const toTop = -buffer.viewportY;
      if (toTop !== 0) term.scrollLines(toTop);
    }
    const scrollAmt = targetY - term.buffer.active.viewportY;
    if (scrollAmt !== 0) term.scrollLines(scrollAmt);
    term.select(fallback.col, fallback.line, fallback.size);
    return "ok";
  }

  term.clearSelection();
  return "out-of-scrollback";
}

export function runTerminalSearch(
  addon: SearchAddon,
  direction: "next" | "prev",
  query: string,
  caseSensitive: boolean,
  incremental = false,
): boolean {
  if (!query) {
    clearTerminalSearch(addon);
    return false;
  }
  const opts = searchOptions(caseSensitive, incremental);
  const internal: InternalSearchOptions | undefined = incremental
    ? { noScroll: true }
    : undefined;
  return direction === "next"
    ? addon.findNext(query, opts, internal)
    : addon.findPrevious(query, opts, internal);
}

/** @deprecated kept for PTY mapping helpers if needed elsewhere */
export function resolvePtyMatchInXterm(
  _term: Terminal,
  _lineText: string,
  _ptyMatch: PtyTextMatch,
  _query: string,
  _caseSensitive: boolean,
): TerminalMatch | null {
  return null;
}

export { SEARCH_DEBOUNCE_MS };

import type { Terminal } from "@xterm/xterm";
import type { IBufferRange } from "@xterm/xterm";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import {
  MATCH_COUNT_CAP,
  collectLineMatches,
  isValidSearchRegex,
  type PtyTextMatch,
} from "../../shared/pty-output-search";

/** Internal 3rd arg on findNext/findPrevious (not in public .d.ts). */
interface InternalSearchOptions {
  noScroll?: boolean;
}

/**
 * The shipped `@xterm/addon-search` JS reads an undocumented third `noScroll`
 * argument at runtime, but its public typings only declare two parameters. These
 * thin wrappers preserve the no-scroll behavior while keeping the call sites typed.
 */
type SearchFindFn = (
  term: string,
  options?: ISearchOptions,
  internal?: InternalSearchOptions,
) => boolean;

function findNextInternal(
  addon: SearchAddon,
  term: string,
  options: ISearchOptions,
  internal?: InternalSearchOptions,
): boolean {
  return (addon.findNext as SearchFindFn)(term, options, internal);
}

function findPreviousInternal(
  addon: SearchAddon,
  term: string,
  options: ISearchOptions,
  internal?: InternalSearchOptions,
): boolean {
  return (addon.findPrevious as SearchFindFn)(term, options, internal);
}

const SEARCH_DEBOUNCE_MS = 120;

export { MATCH_COUNT_CAP };

/** Align with main process PTY_OUTPUT_BUFFERS rolling tail. */
export const XTERM_SCROLLBACK_LINES = 20_000;

export interface TerminalSearchFlags {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

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
  /**
   * Extra matches in the PTY char buffer vs the same matcher on xterm buffer
   * text (trimmed history / cleared viewport). Apples-to-apples — not SearchAddon delta.
   */
  outsideScrollback: number;
  /** True when the PTY side hit MATCH_COUNT_CAP while computing outsideScrollback. */
  outsideCapped: boolean;
  /** Regex mode is on but the query is not a valid RegExp. */
  invalidRegex: boolean;
}

function emptySnapshot(partial?: Partial<SearchSnapshot>): SearchSnapshot {
  return {
    session: [],
    sessionCapped: false,
    outsideScrollback: 0,
    outsideCapped: false,
    invalidRegex: false,
    ...partial,
  };
}

/** Logical lines from xterm (unwrap wrapped rows), matching SearchAddon line model. */
export function xtermLogicalLines(term: Terminal): string[] {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  let y = 0;
  while (y < buffer.length) {
    const first = buffer.getLine(y);
    if (!first) {
      y += 1;
      continue;
    }
    if (first.isWrapped) {
      y += 1;
      continue;
    }
    let text = first.translateToString(true);
    let nextY = y + 1;
    while (nextY < buffer.length) {
      const next = buffer.getLine(nextY);
      if (!next?.isWrapped) break;
      text += next.translateToString(true);
      nextY += 1;
    }
    lines.push(text);
    y = nextY;
  }
  return lines;
}

function countMatchesInLines(
  lines: string[],
  query: string,
  flags: TerminalSearchFlags,
): { total: number; capped: boolean } {
  let total = 0;
  for (const line of lines) {
    const remaining = MATCH_COUNT_CAP - total;
    if (remaining <= 0) return { total, capped: true };
    total += collectLineMatches(line, query, flags, remaining).length;
  }
  return { total, capped: total >= MATCH_COUNT_CAP };
}

export function searchOptions(
  flags: TerminalSearchFlags,
  incremental = false,
): ISearchOptions {
  return {
    caseSensitive: flags.caseSensitive,
    wholeWord: flags.wholeWord,
    regex: flags.regex,
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
  flags: TerminalSearchFlags,
): { matches: TerminalMatch[]; capped: boolean } {
  if (!query) return { matches: [], capped: false };
  if (flags.regex && !isValidSearchRegex(query)) {
    return { matches: [], capped: false };
  }

  const opts = searchOptions(flags);
  addon.clearDecorations();
  term.clearSelection();

  const matches: TerminalMatch[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < MATCH_COUNT_CAP; i++) {
    if (!findNextInternal(addon, query, opts, { noScroll: true })) {
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

  return {
    matches: sortTerminalMatches(matches),
    capped: matches.length >= MATCH_COUNT_CAP,
  };
}

/** Fallback when SearchAddon finds nothing (per-row translateToString). */
function collectFallbackLineMatches(
  term: Terminal,
  query: string,
  flags: TerminalSearchFlags,
): TerminalMatch[] {
  const buffer = term.buffer.active;
  const matches: TerminalMatch[] = [];

  for (let y = 0; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;
    const text = line.translateToString(true);
    if (!text) continue;
    const remaining = MATCH_COUNT_CAP - matches.length;
    const lineMatches = collectLineMatches(text, query, flags, remaining);
    for (const m of lineMatches) {
      matches.push({ line: y, col: m.col, size: m.size });
    }
    if (matches.length >= MATCH_COUNT_CAP) return matches;
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
  flags: TerminalSearchFlags,
): boolean {
  if (!query || index < 1) return false;
  if (flags.regex && !isValidSearchRegex(query)) return false;

  const opts = searchOptions(flags);
  addon.clearDecorations();
  term.clearSelection();

  for (let i = 0; i < index - 1; i++) {
    if (!findNextInternal(addon, query, opts, { noScroll: true })) {
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

async function countPtyMatches(
  sessionId: string,
  query: string,
  flags: TerminalSearchFlags,
): Promise<{ total: number; capped: boolean }> {
  try {
    const result = await window.api.ptySearchOutput(sessionId, query, {
      caseSensitive: flags.caseSensitive,
      wholeWord: flags.wholeWord,
      regex: flags.regex,
      maxMatches: MATCH_COUNT_CAP,
    });
    return { total: result.total, capped: result.capped };
  } catch {
    return { total: 0, capped: false };
  }
}

export async function buildSearchSnapshot(
  sessionId: string,
  term: Terminal | null,
  query: string,
  flags: TerminalSearchFlags,
  addon: SearchAddon | null,
): Promise<SearchSnapshot> {
  if (!term || !query) {
    return emptySnapshot();
  }

  if (!addon) {
    return emptySnapshot();
  }

  if (flags.regex && !isValidSearchRegex(query)) {
    return emptySnapshot({ invalidRegex: true });
  }

  let { matches, capped } = collectAllMatchesViaAddon(addon, term, query, flags);

  if (matches.length === 0) {
    matches = collectFallbackLineMatches(term, query, flags);
    capped = matches.length >= MATCH_COUNT_CAP;
  }

  // Same matcher on both buffers — avoids false "beyond" from SearchAddon vs PTY deltas.
  const xtermText = countMatchesInLines(xtermLogicalLines(term), query, flags);
  const pty = await countPtyMatches(sessionId, query, flags);
  const outsideScrollback = Math.max(0, pty.total - xtermText.total);
  const outsideCapped = outsideScrollback > 0 && pty.capped;

  const session: ResolvedSessionMatch[] = matches.map((m) => ({
    pty: m,
    lineText: "",
    xterm: m,
  }));

  return {
    session,
    sessionCapped: capped,
    outsideScrollback,
    outsideCapped,
    invalidRegex: false,
  };
}

/** Scroll-only jump using coordinates from SearchAddon selection. */
export function jumpToSessionMatch(
  term: Terminal,
  entry: ResolvedSessionMatch,
  query: string,
  flags: TerminalSearchFlags,
  addon: SearchAddon | null,
  matchIndex: number,
): MatchScrollStatus {
  if (!query || !addon) {
    term.clearSelection();
    return "out-of-scrollback";
  }

  if (!entry.xterm) {
    term.clearSelection();
    return "out-of-scrollback";
  }

  if (jumpToMatchViaAddon(addon, term, matchIndex, query, flags)) {
    return "ok";
  }

  const fallback = entry.xterm;
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

export function runTerminalSearch(
  addon: SearchAddon,
  direction: "next" | "prev",
  query: string,
  flags: TerminalSearchFlags,
  incremental = false,
): boolean {
  if (!query) {
    clearTerminalSearch(addon);
    return false;
  }
  if (flags.regex && !isValidSearchRegex(query)) {
    clearTerminalSearch(addon);
    return false;
  }
  const opts = searchOptions(flags, incremental);
  const internal: InternalSearchOptions | undefined = incremental
    ? { noScroll: true }
    : undefined;
  return direction === "next"
    ? findNextInternal(addon, query, opts, internal)
    : findPreviousInternal(addon, query, opts, internal);
}

/** @deprecated kept for PTY mapping helpers if needed elsewhere */
export function resolvePtyMatchInXterm(
  _term: Terminal,
  _lineText: string,
  _ptyMatch: PtyTextMatch,
  _query: string,
  _flags: TerminalSearchFlags,
): TerminalMatch | null {
  return null;
}

export { SEARCH_DEBOUNCE_MS };

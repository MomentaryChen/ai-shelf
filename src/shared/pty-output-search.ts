/** Shared PTY transcript search (main + renderer). */

export const MATCH_COUNT_CAP = 1000;

/**
 * Characters treated as non-word for whole-word matching.
 * Kept in sync with `@xterm/addon-search` SearchEngine.NON_WORD_CHARACTERS.
 */
export const NON_WORD_CHARACTERS =
  " ~!@#$%^&*()+`-=[]{}|\\;:\"',./<>?";

export interface PtyTextMatch {
  /** 0-based line index in normalized PTY text (split on `\n`). */
  line: number;
  col: number;
  size: number;
}

export interface PtySearchHit extends PtyTextMatch {
  lineText: string;
  /** Trimmed context before the match on the same line. */
  before: string;
  /** Trimmed context after the match on the same line. */
  after: string;
}

export interface PtySearchResult {
  matches: PtySearchHit[];
  total: number;
  capped: boolean;
}

export interface PtySearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  maxMatches?: number;
  contextChars?: number;
}

export interface LineMatch {
  col: number;
  size: number;
}

export function normalizePtyText(raw: string): string {
  // Strip ANSI (duplicated minimal version — renderer uses strip-ansi for UI).
  /* eslint-disable no-control-regex -- intentional ANSI / OSC escape matching */
  const stripped = raw
    .replace(/\x1b\][^\x07\x1b\\]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  /* eslint-enable no-control-regex */
  return stripped.replace(/\r/g, "");
}

export function ptyTextLines(raw: string): string[] {
  return normalizePtyText(raw).split("\n");
}

/** Raw PTY lines (keeps ANSI) for replay into xterm. */
export function ptyRawLines(raw: string): string[] {
  return raw.replace(/\r/g, "").split("\n");
}

export function getPtyLineText(raw: string, lineIndex: number): string {
  return ptyTextLines(raw)[lineIndex] ?? "";
}

export function isValidSearchRegex(query: string): boolean {
  if (!query) return true;
  try {
    new RegExp(query);
    return true;
  } catch {
    return false;
  }
}

function isWholeWord(line: string, index: number, term: string): boolean {
  const before = index === 0 ? undefined : line[index - 1];
  const after =
    index + term.length === line.length
      ? undefined
      : line[index + term.length];
  const beforeOk = before === undefined || NON_WORD_CHARACTERS.includes(before);
  const afterOk = after === undefined || NON_WORD_CHARACTERS.includes(after);
  return beforeOk && afterOk;
}

/** Collect matches on a single line (substring / whole-word / regex). */
export function collectLineMatches(
  line: string,
  query: string,
  opts: Pick<PtySearchOptions, "caseSensitive" | "wholeWord" | "regex"> = {},
  maxMatches = MATCH_COUNT_CAP,
): LineMatch[] {
  if (!query || maxMatches <= 0) return [];

  const caseSensitive = opts.caseSensitive ?? false;
  const wholeWord = opts.wholeWord ?? false;
  const regex = opts.regex ?? false;
  const matches: LineMatch[] = [];

  if (regex) {
    let re: RegExp;
    try {
      re = new RegExp(query, caseSensitive ? "g" : "gi");
    } catch {
      return [];
    }
    let found: RegExpExecArray | null;
    while ((found = re.exec(line)) !== null) {
      if (found[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (!wholeWord || isWholeWord(line, found.index, found[0])) {
        matches.push({ col: found.index, size: found[0].length });
        if (matches.length >= maxMatches) return matches;
      }
    }
    return matches;
  }

  const needle = caseSensitive ? query : query.toLowerCase();
  const haystack = caseSensitive ? line : line.toLowerCase();
  let idx = 0;
  while (idx <= haystack.length) {
    const found = haystack.indexOf(needle, idx);
    if (found < 0) break;
    if (!wholeWord || isWholeWord(haystack, found, needle)) {
      matches.push({ col: found, size: query.length });
      if (matches.length >= maxMatches) return matches;
    }
    idx = found + 1;
  }
  return matches;
}

export function collectPtyTextMatches(
  rawBuffer: string,
  query: string,
  opts: Pick<
    PtySearchOptions,
    "caseSensitive" | "wholeWord" | "regex" | "maxMatches"
  > = {},
): { matches: PtyTextMatch[]; capped: boolean } {
  if (!query) return { matches: [], capped: false };
  if (opts.regex && !isValidSearchRegex(query)) {
    return { matches: [], capped: false };
  }

  const maxMatches = opts.maxMatches ?? MATCH_COUNT_CAP;
  const lines = ptyTextLines(rawBuffer);
  const matches: PtyTextMatch[] = [];
  let capped = false;

  for (let line = 0; line < lines.length; line++) {
    const text = lines[line] ?? "";
    const remaining = maxMatches - matches.length;
    const lineMatches = collectLineMatches(text, query, opts, remaining);
    for (const m of lineMatches) {
      matches.push({ line, col: m.col, size: m.size });
    }
    if (matches.length >= maxMatches) {
      capped = true;
      break;
    }
  }

  return { matches, capped };
}

export function searchPtyOutput(
  rawBuffer: string,
  query: string,
  opts: PtySearchOptions = {},
): PtySearchResult {
  const contextChars = opts.contextChars ?? 40;
  const maxMatches = opts.maxMatches ?? MATCH_COUNT_CAP;

  const { matches, capped } = collectPtyTextMatches(rawBuffer, query, {
    caseSensitive: opts.caseSensitive,
    wholeWord: opts.wholeWord,
    regex: opts.regex,
    maxMatches,
  });

  const lines = ptyTextLines(rawBuffer);
  const hits: PtySearchHit[] = matches.map((m) => {
    const lineText = lines[m.line] ?? "";
    const start = m.col;
    const end = start + m.size;
    return {
      ...m,
      lineText,
      before: lineText.slice(Math.max(0, start - contextChars), start),
      after: lineText.slice(end, end + contextChars),
    };
  });

  return { matches: hits, total: hits.length, capped };
}

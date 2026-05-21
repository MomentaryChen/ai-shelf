/** Shared PTY transcript search (main + renderer). */

export const MATCH_COUNT_CAP = 1000;

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
  maxMatches?: number;
  contextChars?: number;
}

export function normalizePtyText(raw: string): string {
  // Strip ANSI (duplicated minimal version — renderer uses strip-ansi for UI).
  const stripped = raw.replace(/\x1b\][^\x07\x1b\\]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
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

export function collectPtyTextMatches(
  rawBuffer: string,
  query: string,
  caseSensitive: boolean,
  maxMatches = MATCH_COUNT_CAP,
): { matches: PtyTextMatch[]; capped: boolean } {
  if (!query) return { matches: [], capped: false };

  const lines = ptyTextLines(rawBuffer);
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: PtyTextMatch[] = [];
  let capped = false;

  for (let line = 0; line < lines.length; line++) {
    const haystack = caseSensitive ? lines[line]! : lines[line]!.toLowerCase();
    let idx = 0;
    while (idx <= haystack.length) {
      const found = haystack.indexOf(needle, idx);
      if (found < 0) break;
      matches.push({ line, col: found, size: query.length });
      if (matches.length >= maxMatches) {
        capped = true;
        return { matches, capped };
      }
      idx = found + 1;
    }
  }

  return { matches, capped };
}

export function searchPtyOutput(
  rawBuffer: string,
  query: string,
  opts: PtySearchOptions = {},
): PtySearchResult {
  const caseSensitive = opts.caseSensitive ?? false;
  const contextChars = opts.contextChars ?? 40;
  const maxMatches = opts.maxMatches ?? MATCH_COUNT_CAP;

  const { matches, capped } = collectPtyTextMatches(
    rawBuffer,
    query,
    caseSensitive,
    maxMatches,
  );

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

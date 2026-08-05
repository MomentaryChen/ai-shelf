/** Pure line-diff helpers for the Tools → Diff panel. */

export type DiffOp = "equal" | "add" | "remove";

export type DiffLine = {
  type: DiffOp;
  text: string;
  /** 1-based line number in the left (original) text, or null when added. */
  leftNo: number | null;
  /** 1-based line number in the right (changed) text, or null when removed. */
  rightNo: number | null;
};

export type DiffOptions = {
  /** Compare lines after trimming trailing/leading whitespace. */
  ignoreWhitespace?: boolean;
};

export type DiffResult = {
  lines: DiffLine[];
  added: number;
  removed: number;
  identical: boolean;
};

/** Soft cap so O(n·m) LCS stays responsive in the renderer (~8MB DP table). */
export const MAX_DIFF_LINES = 2000;

export type DiffComputeResult =
  | { ok: true; result: DiffResult }
  | { ok: false; reason: "tooLarge"; leftLines: number; rightLines: number };

/**
 * Count logical lines without allocating the split array.
 * Matches {@link splitLines}: CRLF/CR → LF, trailing newline does not add a line.
 * Stops early once `limit` is exceeded (pass `MAX_DIFF_LINES` to bail cheaply).
 */
export function countLines(text: string, limit = Number.POSITIVE_INFINITY): number {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 10 /* \n */) {
      if (i === text.length - 1) break; // trailing LF → no extra empty line
      lines += 1;
      if (lines > limit) return lines;
    } else if (ch === 13 /* \r */) {
      if (i === text.length - 1) break; // trailing CR
      if (text.charCodeAt(i + 1) === 10) i += 1; // consume CRLF as one break
      if (i === text.length - 1) break; // trailing CRLF
      lines += 1;
      if (lines > limit) return lines;
    }
  }
  return lines;
}

/**
 * Split on `\n`, strip a single trailing `\r` per line (handles CRLF).
 * A trailing newline does not create an extra empty line.
 */
export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}

function normalizeForCompare(line: string, ignoreWhitespace: boolean): string {
  return ignoreWhitespace ? line.trim() : line;
}

/**
 * Classic LCS backtrace over line arrays. Prefer this over an npm diff package
 * to keep Tools dependencies minimal (same style as json/jwt utils).
 */
function lcsDiff(
  left: string[],
  right: string[],
  ignoreWhitespace: boolean,
): DiffLine[] {
  const n = left.length;
  const m = right.length;
  const leftKeys = left.map((line) => normalizeForCompare(line, ignoreWhitespace));
  const rightKeys = right.map((line) => normalizeForCompare(line, ignoreWhitespace));

  // dp[i][j] = LCS length of left[0..i) and right[0..j)
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    const prev = dp[i - 1]!;
    const cur = dp[i]!;
    const a = leftKeys[i - 1]!;
    for (let j = 1; j <= m; j++) {
      if (a === rightKeys[j - 1]) {
        cur[j] = (prev[j - 1]! + 1) as number;
      } else {
        cur[j] = Math.max(prev[j]!, cur[j - 1]!) as number;
      }
    }
  }

  const out: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftKeys[i - 1] === rightKeys[j - 1]) {
      out.push({
        type: "equal",
        text: right[j - 1]!,
        leftNo: i,
        rightNo: j,
      });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      out.push({
        type: "add",
        text: right[j - 1]!,
        leftNo: null,
        rightNo: j,
      });
      j -= 1;
    } else {
      out.push({
        type: "remove",
        text: left[i - 1]!,
        leftNo: i,
        rightNo: null,
      });
      i -= 1;
    }
  }

  out.reverse();
  return out;
}

export function summarizeDiff(lines: DiffLine[]): Pick<DiffResult, "added" | "removed" | "identical"> {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "add") added += 1;
    else if (line.type === "remove") removed += 1;
  }
  return { added, removed, identical: added === 0 && removed === 0 };
}

/**
 * Line-oriented diff of two texts.
 * Returns `{ ok: false, reason: "tooLarge" }` when either side exceeds {@link MAX_DIFF_LINES}.
 */
export function computeLineDiff(
  left: string,
  right: string,
  options: DiffOptions = {},
): DiffComputeResult {
  const leftCount = countLines(left, MAX_DIFF_LINES);
  const rightCount = countLines(right, MAX_DIFF_LINES);

  if (leftCount > MAX_DIFF_LINES || rightCount > MAX_DIFF_LINES) {
    return {
      ok: false,
      reason: "tooLarge",
      leftLines: leftCount,
      rightLines: rightCount,
    };
  }

  const leftLines = splitLines(left);
  const rightLines = splitLines(right);
  const ignoreWhitespace = options.ignoreWhitespace === true;
  const lines = lcsDiff(leftLines, rightLines, ignoreWhitespace);
  const stats = summarizeDiff(lines);
  return {
    ok: true,
    result: {
      lines,
      ...stats,
    },
  };
}

/** Format a unified-style patch (no file headers) suitable for clipboard. */
export function formatUnifiedDiff(lines: DiffLine[]): string {
  if (lines.length === 0) return "";
  const out: string[] = [];
  for (const line of lines) {
    if (line.type === "equal") out.push(` ${line.text}`);
    else if (line.type === "add") out.push(`+${line.text}`);
    else out.push(`-${line.text}`);
  }
  return out.join("\n");
}

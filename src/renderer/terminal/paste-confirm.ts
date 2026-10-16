/**
 * Decide whether a terminal paste needs a confirmation step, and shape the
 * text for the confirmation dialog. Pure helpers (no DOM / xterm) so they are
 * unit-tested directly; EmbeddedTerminal owns the dialog and delivery.
 */

export interface PasteConfirmSettings {
  /** Confirm pastes over the line / size thresholds below. */
  enabled: boolean;
  /** Confirm when the paste has more lines than this. */
  maxLines: number;
  /** Confirm when the paste has more characters than this. */
  maxChars: number;
  /** Confirm every paste that reaches more than one pane, whatever its size. */
  alwaysWhenBroadcast: boolean;
}

export const DEFAULT_PASTE_CONFIRM_MAX_LINES = 5;
export const DEFAULT_PASTE_CONFIRM_MAX_CHARS = 2048;
export const MIN_PASTE_CONFIRM_MAX_LINES = 1;
export const MAX_PASTE_CONFIRM_MAX_LINES = 10_000;
export const MIN_PASTE_CONFIRM_MAX_CHARS = 64;
export const MAX_PASTE_CONFIRM_MAX_CHARS = 10_000_000;

export interface PasteStats {
  /** Lines as the user sees them; a single trailing newline does not add one. */
  lines: number;
  /** Unicode code points (a CJK char or emoji counts once). */
  chars: number;
  hasNewline: boolean;
}

export type PasteConfirmReason = "lines" | "size" | "broadcast";

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function analyzePaste(text: string): PasteStats {
  if (!text) return { lines: 0, chars: 0, hasNewline: false };
  const normalized = normalizeNewlines(text);
  const surrogatePairs = normalized.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0;
  const chars = normalized.length - surrogatePairs;
  let lines = normalized.split("\n").length;
  if (normalized.endsWith("\n")) lines -= 1;
  return { lines: Math.max(1, lines), chars, hasNewline: normalized.includes("\n") };
}

/**
 * Why this paste needs confirming; empty means paste straight through.
 * `targetCount` is how many panes will receive it (1 unless broadcast is on).
 */
export function getPasteConfirmReasons(
  stats: PasteStats,
  targetCount: number,
  settings: PasteConfirmSettings,
): PasteConfirmReason[] {
  if (stats.chars === 0) return [];
  const reasons: PasteConfirmReason[] = [];
  if (settings.enabled) {
    if (stats.lines > settings.maxLines) reasons.push("lines");
    if (stats.chars > settings.maxChars) reasons.push("size");
  }
  if (settings.alwaysWhenBroadcast && targetCount > 1) reasons.push("broadcast");
  return reasons;
}

export function shouldConfirmPaste(
  text: string,
  targetCount: number,
  settings: PasteConfirmSettings,
): boolean {
  return getPasteConfirmReasons(analyzePaste(text), targetCount, settings).length > 0;
}

/**
 * Collapse a multi-line paste into one command line: drop blank lines, trim
 * each line, strip shell line continuations (`\` for sh, `` ` `` for
 * PowerShell, `^` for cmd) and join with single spaces.
 */
export function toSingleLinePaste(text: string): string {
  return normalizeNewlines(text)
    .split("\n")
    .map((line) => line.trim().replace(/\s*[\\`^]$/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ");
}

/** C0 controls (except tab / newline) and DEL rendered as visible Control Pictures. */
function revealControlChars(text: string): string {
  return text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, (c) => {
    const code = c.charCodeAt(0);
    return String.fromCharCode(code === 0x7f ? 0x2421 : 0x2400 + code);
  });
}

export interface PastePreview {
  text: string;
  truncated: boolean;
}

/**
 * First `maxLines` lines / `maxChars` code points of the paste, with hidden
 * control characters (e.g. ESC sequences) made visible so they can't hide.
 */
export function buildPastePreview(
  text: string,
  maxLines = 12,
  maxChars = 2000,
): PastePreview {
  const normalized = normalizeNewlines(text).replace(/\n$/, "");
  const lines = normalized.split("\n");
  let truncated = lines.length > maxLines;
  let preview = lines.slice(0, maxLines).join("\n");
  const points = Array.from(preview);
  if (points.length > maxChars) {
    preview = points.slice(0, maxChars).join("");
    truncated = true;
  }
  return { text: revealControlChars(preview), truncated };
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const v = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function normalizePasteConfirmMaxLines(raw: unknown): number {
  return clampInt(
    raw,
    MIN_PASTE_CONFIRM_MAX_LINES,
    MAX_PASTE_CONFIRM_MAX_LINES,
    DEFAULT_PASTE_CONFIRM_MAX_LINES,
  );
}

export function normalizePasteConfirmMaxChars(raw: unknown): number {
  return clampInt(
    raw,
    MIN_PASTE_CONFIRM_MAX_CHARS,
    MAX_PASTE_CONFIRM_MAX_CHARS,
    DEFAULT_PASTE_CONFIRM_MAX_CHARS,
  );
}

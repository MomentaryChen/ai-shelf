/**
 * Locate the *visual* caret of an Ink-style TUI (Claude Code, Codex, …) inside
 * the terminal viewport.
 *
 * Ink hides the hardware cursor and paints its own caret as an inverse-video
 * cell, so xterm's IME anchor (which follows the hardware cursor) lands in the
 * wrong place. Highlighted rows — slash-command menus, `@` file pickers, mode
 * banners — are inverse too, but they span many columns while a caret never
 * does. Run length is what separates them.
 *
 * Kept free of DOM/xterm types so the heuristic is unit-testable.
 */

export interface ImeCaretCell {
  /** xterm's `IBufferCell.isInverse()` returns 0 | 1, not a boolean. */
  isInverse(): number;
}

export interface ImeCaretLine {
  readonly length: number;
  getCell(x: number): ImeCaretCell | undefined;
}

/** Viewport-relative view of the buffer: `getLine(0)` is the top visible row. */
export interface ImeCaretViewport {
  readonly rows: number;
  getLine(row: number): ImeCaretLine | undefined;
}

export interface ImeCaretPosition {
  col: number;
  row: number;
}

/** A caret covers 1 cell — or 2 when it sits on a full-width CJK glyph. */
export const MAX_CARET_RUN = 2;

/**
 * Bottom-most short inverse run in the viewport, or null when there is none.
 *
 * Scans bottom-up because the AI prompt box sits below the transcript, and
 * skips whole inverse runs longer than `maxCaretRun` so a highlighted menu row
 * can never win — including its right-hand end, which looks "isolated" to a
 * neighbour-only check because it has no inverse cell to its right.
 */
export function findCaretCell(
  view: ImeCaretViewport,
  maxCaretRun: number = MAX_CARET_RUN,
): ImeCaretPosition | null {
  for (let row = view.rows - 1; row >= 0; row--) {
    const line = view.getLine(row);
    if (!line) continue;

    let x = line.length - 1;
    while (x >= 0) {
      if (!line.getCell(x)?.isInverse()) {
        x--;
        continue;
      }
      // x is the right end of an inverse run; walk left to its start.
      let start = x;
      while (start > 0 && line.getCell(start - 1)?.isInverse()) start--;

      if (x - start + 1 <= maxCaretRun) return { col: start, row };
      x = start - 1; // selection bar / highlighted row — skip it whole
    }
  }
  return null;
}

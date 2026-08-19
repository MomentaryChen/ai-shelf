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
 * The scan runs on every render while the pane is focused, and reads every
 * cell in the viewport whenever it finds nothing — which field logs say is the
 * common case, at least for CLIs that leave the real cursor on the prompt. It
 * is therefore written to allocate nothing per cell; see `ImeCaretScratch`.
 *
 * Kept free of DOM/xterm types so the heuristic is unit-testable.
 */

export interface ImeCaretCell {
  /** xterm's `IBufferCell.isInverse()` returns 0 | 1, not a boolean. */
  isInverse(): number;
}

export interface ImeCaretLine {
  readonly length: number;
  /**
   * `cell` is an out-parameter, matching xterm's `IBufferLine.getCell`: pass
   * one and the cell is loaded into it and handed back; pass nothing and a
   * fresh object is allocated for every call.
   */
  getCell(x: number, cell?: ImeCaretCell): ImeCaretCell | undefined;
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

/**
 * Holder for the one cell object a scan reuses.
 *
 * Without it, `getCell` allocates a `CellData` per call — xterm's
 * `BufferLineApiView.getCell` ends in `loadCell(x, new CellData())` when no
 * cell is supplied. A miss reads the whole viewport, so a 200×50 pane would
 * churn ten thousand short-lived objects per rendered frame, on every frame
 * the pane is focused, to answer a question that usually comes back "no".
 *
 * Callers keep one of these per terminal and hand it in; the first read seeds
 * it and every read after that writes through it.
 */
export interface ImeCaretScratch {
  cell?: ImeCaretCell;
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
  scratch?: ImeCaretScratch,
): ImeCaretPosition | null {
  const isInverse = (line: ImeCaretLine, x: number): boolean => {
    const cell = line.getCell(x, scratch?.cell);
    if (!cell) return false;
    // Seed the scratch from the first read; later reads write through it.
    if (scratch) scratch.cell = cell;
    return cell.isInverse() !== 0;
  };

  for (let row = view.rows - 1; row >= 0; row--) {
    const line = view.getLine(row);
    if (!line) continue;

    let x = line.length - 1;
    while (x >= 0) {
      if (!isInverse(line, x)) {
        x--;
        continue;
      }
      // x is the right end of an inverse run; walk left to its start.
      let start = x;
      while (start > 0 && isInverse(line, start - 1)) start--;

      if (x - start + 1 <= maxCaretRun) return { col: start, row };
      x = start - 1; // selection bar / highlighted row — skip it whole
    }
  }
  return null;
}

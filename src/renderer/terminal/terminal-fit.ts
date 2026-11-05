/**
 * Decide how to fit xterm to its pane.
 *
 * A container that has not been laid out yet still reports a few pixels.
 * Fitting that collapses the grid to a couple of columns, so Claude's
 * full-screen frame wraps one logical row into a tall stack. Skip until the
 * pane is actually there. When the grid is unchanged, still allow a remeasure
 * so a late WebGL swap or font load can fix cell metrics without a no-op resize.
 */

export const MIN_TERMINAL_FIT_WIDTH = 40;
export const MIN_TERMINAL_FIT_HEIGHT = 24;

export type TerminalFitAction = "skip" | "resize" | "remeasure";

export function terminalFitAction(input: {
  proposal: { cols: number; rows: number } | undefined;
  containerWidth: number;
  containerHeight: number;
  currentCols: number;
  currentRows: number;
  forceMetrics: boolean;
}): TerminalFitAction {
  const { proposal, containerWidth, containerHeight, currentCols, currentRows, forceMetrics } =
    input;
  if (!proposal) return "skip";
  if (!Number.isInteger(proposal.cols) || !Number.isInteger(proposal.rows)) return "skip";
  if (proposal.cols < 2 || proposal.rows < 1) return "skip";
  if (containerWidth < MIN_TERMINAL_FIT_WIDTH || containerHeight < MIN_TERMINAL_FIT_HEIGHT) {
    return "skip";
  }
  if (proposal.cols !== currentCols || proposal.rows !== currentRows) return "resize";
  if (forceMetrics) return "remeasure";
  return "skip";
}

type GridTerminal = {
  cols: number;
  rows: number;
  resize: (cols: number, rows: number) => void;
  refresh: (start: number, end: number) => void;
};

type RenderServiceLike = {
  clear?: () => void;
  handleResize?: (cols: number, rows: number) => void;
};

/**
 * Apply a fit action. Resize clears the renderer first so WebGL does not keep
 * glyphs at the previous row pitch (one row painted as a stack of copies).
 */
export function paintTerminalGrid(
  term: GridTerminal,
  action: TerminalFitAction,
  cols: number,
  rows: number,
): void {
  if (action === "skip") return;
  const core = (term as GridTerminal & { _core?: { _renderService?: RenderServiceLike } })._core;
  try {
    if (action === "resize") {
      core?._renderService?.clear?.();
      term.resize(cols, rows);
    } else {
      core?._renderService?.handleResize?.(term.cols, term.rows);
    }
  } catch {
    /* renderer mid-teardown */
  }
  if (term.rows > 0) {
    try {
      term.refresh(0, term.rows - 1);
    } catch {
      /* not open */
    }
  }
}

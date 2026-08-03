/**
 * Reposition xterm IME elements onto the visible TUI caret.
 *
 * Ink-based AI CLIs (Claude Code, Codex, …) often leave the hardware cursor
 * away from their input field. xterm anchors IME to that hardware cursor, so
 * Chinese/Japanese/Korean composition can appear in the wrong place — or fail
 * entirely when the helper textarea ends up clipped / off the input row.
 *
 * Heuristic: Ink draws its caret as a lone inverse-video cell. Pin
 * `.xterm-helper-textarea` and `.composition-view` to that cell while composing.
 *
 * Adapted from https://github.com/msdshsk/xterm-ime-anchor (MIT).
 */

import type { Terminal } from "@xterm/xterm";

export type ImeAnchor = {
  source: "heuristic" | "hardware";
  col: number;
  row: number;
};

export type AttachImeAnchorOptions = {
  onAnchor?: (a: ImeAnchor) => void;
  /** Skip inverse runs that look like selection bars (both neighbours inverse). */
  requireIsolatedCell?: boolean;
};

export function attachImeAnchor(
  terminal: Terminal,
  options: AttachImeAnchorOptions = {},
): () => void {
  const { onAnchor, requireIsolatedCell = true } = options;

  const root = terminal.element;
  if (!root) return () => {};

  const textarea = root.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
  const screen = root.querySelector(".xterm-screen") as HTMLElement | null;
  const compositionView = root.querySelector(".composition-view") as HTMLElement | null;
  if (!textarea || !screen || !compositionView) return () => {};

  let composing = false;
  let pinned: { left: string; top: string } | null = null;
  let renderDisposable: { dispose(): void } | null = null;

  const reapply = (el: HTMLElement) => {
    if (!composing || !pinned) return;
    if (el.style.left !== pinned.left || el.style.top !== pinned.top) {
      el.style.setProperty("left", pinned.left, "important");
      el.style.setProperty("top", pinned.top, "important");
    }
  };
  const moTa = new MutationObserver(() => reapply(textarea));
  const moCv = new MutationObserver(() => reapply(compositionView));

  const computeCellSize = (): { w: number; h: number } => {
    const rect = screen.getBoundingClientRect();
    return {
      w: rect.width / Math.max(terminal.cols, 1),
      h: rect.height / Math.max(terminal.rows, 1),
    };
  };

  const findInverseCell = (): { col: number; row: number } | null => {
    const buf = terminal.buffer.active;
    const rows = terminal.rows;
    const startY = buf.viewportY;

    for (let y = startY + rows - 1; y >= startY; y--) {
      const line = buf.getLine(y);
      if (!line) continue;
      for (let x = line.length - 1; x >= 0; x--) {
        const cell = line.getCell(x);
        if (!cell || !cell.isInverse()) continue;

        if (requireIsolatedCell) {
          const left = x > 0 ? line.getCell(x - 1) : null;
          const right = x + 1 < line.length ? line.getCell(x + 1) : null;
          const leftInv = !!left?.isInverse();
          const rightInv = !!right?.isInverse();
          if (leftInv && rightInv) continue;
        }

        return { col: x, row: y - startY };
      }
    }
    return null;
  };

  const pinTo = (col: number, row: number) => {
    const { w, h } = computeCellSize();
    const left = `${Math.round(col * w)}px`;
    const top = `${Math.round(row * h)}px`;
    if (pinned && pinned.left === left && pinned.top === top) return;
    pinned = { left, top };
    textarea.style.setProperty("left", left, "important");
    textarea.style.setProperty("top", top, "important");
    compositionView.style.setProperty("left", left, "important");
    compositionView.style.setProperty("top", top, "important");
  };

  const recomputeAndPin = () => {
    if (!composing) return;
    const hit = findInverseCell();
    // Keep last pin across Ink clear-then-redraw gaps mid-composition.
    if (!hit) return;
    pinTo(hit.col, hit.row);
    onAnchor?.({ source: "heuristic", col: hit.col, row: hit.row });
  };

  const onCompositionStart = () => {
    composing = true;
    const hit = findInverseCell();
    if (!hit) {
      pinned = null;
      onAnchor?.({
        source: "hardware",
        col: terminal.buffer.active.cursorX,
        row: terminal.buffer.active.cursorY,
      });
    } else {
      pinTo(hit.col, hit.row);
      onAnchor?.({ source: "heuristic", col: hit.col, row: hit.row });
    }
    renderDisposable = terminal.onRender(() => recomputeAndPin());
  };

  const onCompositionEnd = () => {
    composing = false;
    pinned = null;
    renderDisposable?.dispose();
    renderDisposable = null;
  };

  textarea.addEventListener("compositionstart", onCompositionStart);
  textarea.addEventListener("compositionend", onCompositionEnd);
  moTa.observe(textarea, { attributes: true, attributeFilter: ["style"] });
  moCv.observe(compositionView, { attributes: true, attributeFilter: ["style"] });

  return () => {
    composing = false;
    pinned = null;
    renderDisposable?.dispose();
    renderDisposable = null;
    textarea.removeEventListener("compositionstart", onCompositionStart);
    textarea.removeEventListener("compositionend", onCompositionEnd);
    moTa.disconnect();
    moCv.disconnect();
  };
}

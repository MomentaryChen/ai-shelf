/**
 * Reposition xterm IME elements onto the visible TUI caret.
 *
 * Ink-based AI CLIs (Claude Code, Codex, …) hide the hardware cursor and paint
 * their own caret, so xterm — which anchors the IME to the hardware cursor —
 * puts the composition box somewhere else entirely, or off-screen when the
 * hardware cursor has scrolled out of the viewport.
 *
 * xterm 6.1 acknowledges the same class of bug in its `compositionstart`
 * handler: once the IME latches onto a position it "will not move until it is
 * hidden and a custom move occurs". A correction applied *after* composition
 * starts is therefore not enough — the helper textarea has to already sit on
 * the caret before the first keystroke. So this module keeps it pinned for as
 * long as the terminal is focused, not only while composing, and re-pins on
 * both sides of xterm's own `compositionstart` listener.
 *
 * xterm moves those elements back onto the hardware cursor from four places:
 * `_syncTextArea` on cursor move, on resize and on `compositionstart`, and
 * `updateCompositionElements` on render and on `compositionupdate`. So a pin is
 * never "still applied" just because we applied it once — every re-pin compares
 * against the element's live inline style (see `./ime-pin`). Remembering only
 * the *intended* position and skipping the write when it had not changed was
 * the bug behind the misplacement that survived the first fix: after a window
 * switch, or after xterm's `compositionstart` sync, the elements had drifted
 * while the intent had not, so the re-pin did nothing.
 *
 * Caret detection lives in `./ime-caret` and is unit-tested there; the drift
 * rule lives in `./ime-pin`.
 *
 * Adapted from https://github.com/msdshsk/xterm-ime-anchor (MIT).
 */

import type { Terminal } from "@xterm/xterm";
import {
  findCaretCell,
  MAX_CARET_RUN,
  type ImeCaretPosition,
  type ImeCaretViewport,
} from "./ime-caret";
import { applyPin, type Pin } from "./ime-pin";

export type ImeAnchorSource =
  /** Ink caret found — the good path. */
  | "caret"
  /** Composing, but the caret vanished mid-redraw; previous pin kept. */
  | "no-caret"
  /** No caret yet; reused the last caret seen in this terminal. */
  | "last-known"
  /** Nothing to go on; fell back to the (clamped) hardware cursor. */
  | "hardware";

export type ImeAnchor = {
  source: ImeAnchorSource;
  col: number;
  row: number;
  /** Where xterm would have put the IME on its own. */
  hardware: ImeCaretPosition;
};

export type AttachImeAnchorOptions = {
  onAnchor?: (a: ImeAnchor) => void;
  /** Inverse runs longer than this are selection bars, not carets. */
  maxCaretRun?: number;
};

const clamp = (value: number, max: number): number =>
  Math.min(Math.max(value, 0), Math.max(max, 0));

export function attachImeAnchor(
  terminal: Terminal,
  options: AttachImeAnchorOptions = {},
): () => void {
  const { onAnchor, maxCaretRun = MAX_CARET_RUN } = options;

  const root = terminal.element;
  if (!root) return () => {};

  const textarea = root.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
  const screen = root.querySelector(".xterm-screen") as HTMLElement | null;
  const compositionView = root.querySelector(".composition-view") as HTMLElement | null;
  if (!textarea || !screen || !compositionView) return () => {};

  let composing = false;
  let focused = root.ownerDocument.activeElement === textarea;
  let pinned: Pin | null = null;
  /** Survives compositionend so a later composition never starts unanchored. */
  let lastCaret: ImeCaretPosition | null = null;

  const view: ImeCaretViewport = {
    get rows() {
      return terminal.rows;
    },
    getLine(row) {
      const buf = terminal.buffer.active;
      return buf.getLine(buf.viewportY + row);
    },
  };

  const hardwareCursor = (): ImeCaretPosition => {
    const buf = terminal.buffer.active;
    return {
      col: clamp(buf.cursorX, terminal.cols - 1),
      row: clamp(buf.cursorY, terminal.rows - 1),
    };
  };

  const cellSize = (): { w: number; h: number } => {
    const rect = screen.getBoundingClientRect();
    return {
      w: rect.width / Math.max(terminal.cols, 1),
      h: rect.height / Math.max(terminal.rows, 1),
    };
  };

  /**
   * Put the helper elements back on the current pin.
   *
   * Deliberately re-checks their live styles instead of trusting that an
   * earlier apply still holds: xterm rewrites them from render, cursor-move and
   * composition callbacks, and while the pane is blurred nothing here defends
   * them at all.
   */
  const enforcePin = () => {
    if (!pinned) return;
    applyPin([textarea, compositionView], pinned);
    // Match xterm's own _syncTextArea so the invisible textarea stays behind
    // the canvas and cannot swallow clicks while we hold it over the screen.
    if (!composing && textarea.style.zIndex !== "-5") textarea.style.zIndex = "-5";
  };

  // Our own writes re-enter this callback; applyPin then finds no drift and
  // writes nothing, so the loop settles after one correction.
  const observer = new MutationObserver(() => {
    if (composing || focused) enforcePin();
  });

  const pinTo = ({ col, row }: ImeCaretPosition) => {
    const { w, h } = cellSize();
    // A collapsed layout (hidden pane, mid-refit) would pin everything to 0,0.
    if (!(w > 0) || !(h > 0)) return;

    pinned = { left: `${Math.round(col * w)}px`, top: `${Math.round(row * h)}px` };
    enforcePin();
  };

  const resolve = (): { pos: ImeCaretPosition; source: ImeAnchorSource } => {
    const caret = findCaretCell(view, maxCaretRun);
    if (caret) return { pos: caret, source: "caret" };
    // Mid-composition Ink clear-then-redraw: hold the last pin rather than
    // yanking the IME to the hardware cursor.
    if (composing && pinned) return { pos: lastCaret ?? hardwareCursor(), source: "no-caret" };
    if (lastCaret) return { pos: lastCaret, source: "last-known" };
    return { pos: hardwareCursor(), source: "hardware" };
  };

  const anchor = () => {
    const { pos, source } = resolve();
    if (source === "caret") lastCaret = pos;
    // "no-caret" means an Ink redraw ate the caret mid-composition: keep the
    // position we already had, but still re-assert it — xterm's
    // updateCompositionElements is pulling the elements away every tick.
    if (source === "no-caret") enforcePin();
    else pinTo(pos);
    onAnchor?.({ source, col: pos.col, row: pos.row, hardware: hardwareCursor() });
  };

  // Capture on the ancestor so this runs *before* xterm's own compositionstart
  // listener on the textarea; the target-phase one below runs after it and
  // undoes the `_syncTextArea()` that listener performs.
  const onCompositionStartCapture = () => {
    anchor();
  };
  const onCompositionStart = () => {
    composing = true;
    // compositionstart can only fire on the focused textarea, so this also
    // recovers from a `focus` event we never saw (window switch, pane restore).
    focused = true;
    anchor();
  };
  // xterm's compositionupdate handler calls updateCompositionElements(), which
  // drags both elements back to the hardware cursor mid-composition.
  const onCompositionUpdate = () => {
    anchor();
  };
  const onCompositionEnd = () => {
    composing = false;
    enforcePin();
  };
  const onFocus = () => {
    focused = true;
    anchor();
  };
  const onBlur = () => {
    focused = false;
  };

  const renderDisposable = terminal.onRender(() => {
    if (composing || focused) anchor();
  });

  root.addEventListener("compositionstart", onCompositionStartCapture, true);
  textarea.addEventListener("compositionstart", onCompositionStart);
  textarea.addEventListener("compositionupdate", onCompositionUpdate);
  textarea.addEventListener("compositionend", onCompositionEnd);
  textarea.addEventListener("focus", onFocus);
  textarea.addEventListener("blur", onBlur);
  observer.observe(textarea, { attributes: true, attributeFilter: ["style"] });
  observer.observe(compositionView, { attributes: true, attributeFilter: ["style"] });

  if (focused) anchor();

  return () => {
    composing = false;
    focused = false;
    pinned = null;
    lastCaret = null;
    renderDisposable.dispose();
    root.removeEventListener("compositionstart", onCompositionStartCapture, true);
    textarea.removeEventListener("compositionstart", onCompositionStart);
    textarea.removeEventListener("compositionupdate", onCompositionUpdate);
    textarea.removeEventListener("compositionend", onCompositionEnd);
    textarea.removeEventListener("focus", onFocus);
    textarea.removeEventListener("blur", onBlur);
    observer.disconnect();
  };
}

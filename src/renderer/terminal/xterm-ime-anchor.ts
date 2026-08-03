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
 * Caret detection lives in `./ime-caret` and is unit-tested there.
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
  let pinned: { left: string; top: string } | null = null;
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

  const reapply = (el: HTMLElement) => {
    if (!pinned || !(composing || focused)) return;
    if (el.style.left !== pinned.left || el.style.top !== pinned.top) {
      el.style.setProperty("left", pinned.left, "important");
      el.style.setProperty("top", pinned.top, "important");
    }
  };
  const moTa = new MutationObserver(() => reapply(textarea));
  const moCv = new MutationObserver(() => reapply(compositionView));

  const pinTo = ({ col, row }: ImeCaretPosition) => {
    const { w, h } = cellSize();
    // A collapsed layout (hidden pane, mid-refit) would pin everything to 0,0.
    if (!(w > 0) || !(h > 0)) return;

    const left = `${Math.round(col * w)}px`;
    const top = `${Math.round(row * h)}px`;
    if (pinned && pinned.left === left && pinned.top === top) return;
    pinned = { left, top };

    for (const el of [textarea, compositionView]) {
      el.style.setProperty("left", left, "important");
      el.style.setProperty("top", top, "important");
    }
    // Match xterm's own _syncTextArea so the invisible textarea stays behind
    // the canvas and cannot swallow clicks while we hold it over the screen.
    if (!composing) textarea.style.zIndex = "-5";
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
    if (source !== "no-caret") pinTo(pos);
    onAnchor?.({ source, col: pos.col, row: pos.row, hardware: hardwareCursor() });
  };

  // Capture on the ancestor so this runs *before* xterm's own compositionstart
  // listener on the textarea; the target-phase one below runs after it.
  const onCompositionStartCapture = () => {
    anchor();
  };
  const onCompositionStart = () => {
    composing = true;
    anchor();
  };
  const onCompositionEnd = () => {
    composing = false;
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
  textarea.addEventListener("compositionend", onCompositionEnd);
  textarea.addEventListener("focus", onFocus);
  textarea.addEventListener("blur", onBlur);
  moTa.observe(textarea, { attributes: true, attributeFilter: ["style"] });
  moCv.observe(compositionView, { attributes: true, attributeFilter: ["style"] });

  if (focused) anchor();

  return () => {
    composing = false;
    focused = false;
    pinned = null;
    lastCaret = null;
    renderDisposable.dispose();
    root.removeEventListener("compositionstart", onCompositionStartCapture, true);
    textarea.removeEventListener("compositionstart", onCompositionStart);
    textarea.removeEventListener("compositionend", onCompositionEnd);
    textarea.removeEventListener("focus", onFocus);
    textarea.removeEventListener("blur", onBlur);
    moTa.disconnect();
    moCv.disconnect();
  };
}

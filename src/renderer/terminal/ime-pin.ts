/**
 * Write an IME anchor position onto xterm's helper elements.
 *
 * xterm keeps re-positioning the helper textarea and the composition view onto
 * the *hardware* cursor — from `_syncTextArea` on every cursor move / resize /
 * `compositionstart`, and from `updateCompositionElements` on every render and
 * `compositionupdate`. Anything that pins those elements elsewhere is therefore
 * in a tug of war, and the only safe question to ask before writing is "where
 * is the element *right now*", never "where did I last decide to put it".
 *
 * Kept free of DOM/xterm types so the drift rule is unit-testable.
 */

export interface PinnableStyle {
  readonly left: string;
  readonly top: string;
  setProperty(property: string, value: string, priority?: string): void;
}

export interface PinnableElement {
  readonly style: PinnableStyle;
}

export interface Pin {
  left: string;
  top: string;
}

/**
 * Re-assert `pin` on every element whose inline style has drifted from it.
 *
 * Returns how many elements were written, so callers can tell a no-op apply
 * from a real correction. Elements already on the pin are skipped: each write
 * re-triggers the MutationObserver that calls back in here, so writing
 * unconditionally would never settle.
 *
 * `!important` guards against stylesheet rules (xterm's stock
 * `left: -9999em`); it does not stop xterm's own inline assignments, which
 * clear the priority flag — hence the drift check rather than a one-shot pin.
 */
export function applyPin(elements: readonly PinnableElement[], pin: Pin): number {
  let written = 0;
  for (const el of elements) {
    if (el.style.left === pin.left && el.style.top === pin.top) continue;
    el.style.setProperty("left", pin.left, "important");
    el.style.setProperty("top", pin.top, "important");
    written++;
  }
  return written;
}

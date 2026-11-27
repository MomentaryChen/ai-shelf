/**
 * Pure helpers for dragging a split divider. Electron/DOM-free so they can be
 * unit-tested; `SplitPaneLayout` and `ResizeDivider` share them so the live
 * drag preview (written straight to the DOM) and React's committed render
 * always produce the same flex string — no jump on pointerup.
 */

import type { LayoutNode, SplitDirection } from "./split-tree";

/** Smallest share either side of a split may take. */
export const MIN_SPLIT_RATIO = 0.1;
/** Largest share either side of a split may take. */
export const MAX_SPLIT_RATIO = 0.9;

/**
 * The ratio clamp used everywhere (render, `updateSplitRatio`, keyboard
 * `resizePaneInDirection`, layout restore). Divider drags and divider arrow
 * keys additionally go through `clampSplitRatioPx`, which only tightens it.
 */
export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

/**
 * Unclamped ratio of the pointer along the split container
 * (`pointerPx` and `containerPx` measured on the split axis).
 * Returns null when the container has no size (hidden / not laid out).
 */
export function rawRatioFromPointer(pointerPx: number, containerPx: number): number | null {
  if (!(containerPx > 0)) return null;
  return pointerPx / containerPx;
}

/** CSS `flex` shorthand for one side of a split. */
export function splitSideFlex(grow: number, basisPx: number): string {
  return `${grow} 1 ${basisPx}px`;
}

/** Flex values for both sides of a split at `ratio` (already clamped). */
export function splitFlexPair(
  ratio: number,
  firstBasisPx: number,
  secondBasisPx: number,
): { first: string; second: string } {
  return {
    first: splitSideFlex(ratio, firstBasisPx),
    second: splitSideFlex(1 - ratio, secondBasisPx),
  };
}

// ---------------------------------------------------------------------------
// Pixel minimums (drag / divider keyboard only)
// ---------------------------------------------------------------------------

/** Width of the divider strip between two split sides (`SplitBranch`). */
export const SPLIT_DIVIDER_PX = 10;

/**
 * Narrowest a pane may be dragged in a horizontal (side-by-side) split.
 * Fits the header's drag handle, logo, a short title, the "⋯" menu and close
 * (see the compact header in `WarpPaneShell`) and leaves xterm ~15 columns.
 */
export const MIN_PANE_WIDTH_PX = 160;
/**
 * Shortest a pane may be dragged in a vertical (stacked) split: the 36px
 * (`h-9`) header + 2px border + ~50px of terminal (2-3 rows; xterm stops
 * fitting below ~24px).
 */
export const MIN_PANE_HEIGHT_PX = 90;

/** Pixel minimum of one pane along `direction`'s axis. */
export function minPanePx(direction: SplitDirection): number {
  return direction === "horizontal" ? MIN_PANE_WIDTH_PX : MIN_PANE_HEIGHT_PX;
}

/**
 * Smallest size `node` can take along `direction`'s axis, dividers included:
 * a pane needs `paneMinPx`; a split along the axis stacks both children plus
 * its divider (so a side holding 3 columns needs 3× the minimum + 2 dividers);
 * a perpendicular split needs whichever child needs more.
 */
export function minNodePx(
  node: LayoutNode,
  direction: SplitDirection,
  paneMinPx: number = minPanePx(direction),
  dividerPx: number = SPLIT_DIVIDER_PX,
): number {
  if (node.kind === "pane") return paneMinPx;
  const a = minNodePx(node.first, direction, paneMinPx, dividerPx);
  const b = minNodePx(node.second, direction, paneMinPx, dividerPx);
  return node.direction === direction ? a + b + dividerPx : Math.max(a, b);
}

export interface SplitPxBounds {
  /** Split container size on the split axis. */
  containerPx: number;
  /** Divider strip between the two sides. */
  dividerPx: number;
  /** Flex-basis of each side (`nestedDividerPx`). */
  firstBasisPx: number;
  secondBasisPx: number;
  /** Smallest size each side may take (`minNodePx`). */
  firstMinPx: number;
  secondMinPx: number;
}

/**
 * Clamp a dragged ratio so neither side drops below its pixel minimum.
 *
 * Each side renders as `basis + ratio × free` with
 * `free = container − divider − both bases` (see `splitFlexPair`), so the
 * pixel minimums map to ratio bounds directly. The result is always also
 * inside `clampSplitRatio`'s 0.1–0.9 (the pixel bounds only tighten it), so
 * `updateSplitRatio` / render keep exactly the committed value. When the
 * container cannot fit both minimums (or is unsized) this falls back to the
 * plain ratio clamp.
 */
export function clampSplitRatioPx(rawRatio: number, b: SplitPxBounds): number {
  const ratio = clampSplitRatio(rawRatio);
  const free = b.containerPx - b.dividerPx - b.firstBasisPx - b.secondBasisPx;
  if (!(free > 0)) return ratio;
  const lo = Math.max(0, b.firstMinPx - b.firstBasisPx) / free;
  const hi = 1 - Math.max(0, b.secondMinPx - b.secondBasisPx) / free;
  if (lo > hi) return ratio;
  return clampSplitRatio(Math.min(hi, Math.max(lo, ratio)));
}

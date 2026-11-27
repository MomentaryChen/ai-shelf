/**
 * Pure helpers for dragging a split divider. Electron/DOM-free so they can be
 * unit-tested; `SplitPaneLayout` and `ResizeDivider` share them so the live
 * drag preview (written straight to the DOM) and React's committed render
 * always produce the same flex string — no jump on pointerup.
 */

/** Smallest share either side of a split may take. */
export const MIN_SPLIT_RATIO = 0.1;
/** Largest share either side of a split may take. */
export const MAX_SPLIT_RATIO = 0.9;

/**
 * The single place split ratios are clamped (drag preview, commit, render and
 * `updateSplitRatio`). Replace this when moving to pixel-based minimums.
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

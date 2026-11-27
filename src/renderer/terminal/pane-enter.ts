/** How long a newly added pane's frame takes to fade in. */
export const PANE_ENTER_MS = 240;

/**
 * Pane ids that should play the enter fade: ids in `next` that were not on
 * screen in `prev`.
 *
 * A pane frame remounts whenever the split tree changes shape (a leaf turning
 * into a split node moves the existing pane one level down), so a plain
 * "animate on mount" would flash panes that were already there. Diffing ids
 * avoids that.
 *
 * Nothing enters on the first render (`prev === null`, app start / restore) or
 * when no id carries over (a profile switch swaps the whole set and already
 * has its own stage animation).
 */
export function enteringPaneIds(
  prev: readonly string[] | null,
  next: readonly string[],
): string[] {
  if (prev === null) return [];
  const before = new Set(prev);
  if (!next.some((id) => before.has(id))) return [];
  return next.filter((id) => !before.has(id));
}

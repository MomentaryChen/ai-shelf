import {
  collectPanes,
  findPane,
  removePaneFromTree,
  splitPaneInTree,
  type LayoutNode,
  type PaneInfo,
} from "./split-tree";
import { buildDisplayLayout } from "./profile-pane-display";

/**
 * A popped-out pane stays in its origin window's layout tree (so it is saved
 * with the layout and restored there after a restart) and is only hidden from
 * the display. These helpers keep that "hidden, not removed" rule in one place.
 */

/** Panes still shown in this window (input broadcast, shortcuts, paste targets). */
export function withoutPoppedOut(panes: PaneInfo[], poppedOut: ReadonlySet<string>): PaneInfo[] {
  if (poppedOut.size === 0) return panes;
  return panes.filter((p) => !poppedOut.has(p.id));
}

/** Display tree minus popped-out panes (on top of the minimized filter). */
export function displayLayoutWithoutPoppedOut(
  displayLayout: LayoutNode | null,
  poppedOut: ReadonlySet<string>,
  focusedPaneId: string | null,
): LayoutNode | null {
  if (!displayLayout || poppedOut.size === 0) return displayLayout;
  return buildDisplayLayout(displayLayout, poppedOut, focusedPaneId);
}

/** Focus to use after `paneId` leaves the display: keep the current one unless it left. */
export function focusAfterPopOut(
  layout: LayoutNode | null,
  hidden: ReadonlySet<string>,
  paneId: string,
  currentFocus: string | null,
): string | null {
  if (currentFocus && currentFocus !== paneId && !hidden.has(currentFocus)) return currentFocus;
  const next = collectPanes(layout).find((p) => p.id !== paneId && !hidden.has(p.id));
  return next?.id ?? null;
}

export interface CachedProfileLayout {
  layout: LayoutNode;
  focusedPaneId: string | null;
  minimizedPaneIds: string[];
}

/**
 * Layout with `pane` split off `anchorPaneId` — a terminal created inside a
 * pop-out window sits next to the pane it was created from, so docking it back
 * lands beside it. `null` when the anchor is gone or the profile is full.
 */
export function splitNextToPane(
  layout: LayoutNode | null,
  anchorPaneId: string,
  pane: PaneInfo,
  maxPanes: number,
): LayoutNode | null {
  if (!layout || !findPane(layout, anchorPaneId)) return null;
  if (collectPanes(layout).length >= maxPanes) return null;
  return splitPaneInTree(layout, anchorPaneId, "horizontal", pane);
}

/**
 * Remove a pane from a stashed profile's live layout (its pop-out was closed
 * while another profile was active). `null` = the profile has no panes left.
 * Returns the entry unchanged when the pane is not in it.
 */
export function removePaneFromCachedLayout(
  entry: CachedProfileLayout,
  paneId: string,
): CachedProfileLayout | null {
  if (!findPane(entry.layout, paneId)) return entry;
  const layout = removePaneFromTree(entry.layout, paneId);
  if (!layout) return null;
  const remaining = collectPanes(layout);
  return {
    layout,
    focusedPaneId:
      entry.focusedPaneId && entry.focusedPaneId !== paneId
        ? entry.focusedPaneId
        : (remaining[0]?.id ?? null),
    minimizedPaneIds: entry.minimizedPaneIds.filter((id) => id !== paneId),
  };
}

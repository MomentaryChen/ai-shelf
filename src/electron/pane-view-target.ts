/**
 * Decide what a pane drag released at a screen point means, given the app
 * windows under it. Pure (no Electron import) so it can be unit-tested.
 */
import type { Rect } from "./window-bounds.js";
import type { Point } from "./popout-geometry.js";

export type DropWindow =
  | { kind: "origin"; id: number; bounds: Rect }
  | {
      kind: "view";
      id: number;
      bounds: Rect;
      viewId: string;
      originId: number;
      profileKey: string;
    }
  | { kind: "other"; id: number; bounds: Rect };

export interface DragSource {
  paneId: string;
  /** Window that owns the profile layout (main or chat window). */
  originId: number;
  profileKey: string;
  /** View the pane was dragged out of; null = the origin window itself. */
  fromViewId: string | null;
}

export type DropTarget =
  /** Released outside every app window: open a new view there. */
  | { kind: "new-view" }
  /** Released on another view of the same profile: move the pane into it. */
  | { kind: "into-view"; viewId: string }
  /** Released on the origin window while in a view: put it back. */
  | { kind: "dock" }
  /** Released on a view of another profile (or another origin): refuse, tell that window. */
  | { kind: "reject"; windowId: number }
  /** Anything else (same window, settings window, …): nothing to do. */
  | { kind: "none" };

function contains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
}

/**
 * `windows` must be in front-to-back order (most recently focused first) so an
 * overlap resolves to the window the user actually sees on top.
 */
export function resolvePaneDropTarget(
  point: Point,
  windows: DropWindow[],
  source: DragSource,
): DropTarget {
  const hit = windows.find((w) => contains(w.bounds, point));
  if (!hit) return { kind: "new-view" };
  if (hit.kind === "origin") {
    return hit.id === source.originId && source.fromViewId ? { kind: "dock" } : { kind: "none" };
  }
  if (hit.kind === "other") return { kind: "none" };
  if (hit.viewId === source.fromViewId) return { kind: "none" };
  if (hit.originId !== source.originId || hit.profileKey !== source.profileKey) {
    return { kind: "reject", windowId: hit.id };
  }
  return { kind: "into-view", viewId: hit.viewId };
}

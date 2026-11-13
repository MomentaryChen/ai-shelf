/**
 * Pure geometry for terminal pane pop-out windows (tear-off detection and
 * placement). No Electron import so it can be unit-tested with plain Node.
 */
import { clampToWorkArea, type Rect } from "./window-bounds.js";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Smallest pop-out window that still shows a usable terminal. */
export const POPOUT_MIN_SIZE: Size = { width: 420, height: 260 };
/** Used when the renderer did not report the pane size. */
export const POPOUT_DEFAULT_SIZE: Size = { width: 820, height: 520 };

/** Where the cursor lands inside the new window: on its header, near the left edge. */
const GRAB_OFFSET: Point = { x: 48, y: 16 };
/** Offset of a menu-opened pop-out from its origin window's top-left. */
const CASCADE_OFFSET = 48;

function contains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
}

/**
 * True when a drag released at `point` landed outside every app window.
 * Esc-cancelled drags and drops on a non-target inside a window also end with
 * dropEffect "none", so this check decides whether it was a real tear-off.
 */
export function isPointOutsideWindows(point: Point, windows: Rect[]): boolean {
  return !windows.some((w) => contains(w, point));
}

/** Requested size with sane minimums; falls back to the default for bad input. */
export function normalizePopoutSize(size: Partial<Size> | null | undefined): Size {
  const w = size?.width;
  const h = size?.height;
  const width =
    typeof w === "number" && Number.isFinite(w) && w > 0 ? w : POPOUT_DEFAULT_SIZE.width;
  const height =
    typeof h === "number" && Number.isFinite(h) && h > 0 ? h : POPOUT_DEFAULT_SIZE.height;
  return {
    width: Math.round(Math.max(width, POPOUT_MIN_SIZE.width)),
    height: Math.round(Math.max(height, POPOUT_MIN_SIZE.height)),
  };
}

/** Window bounds so the cursor sits on the new window's header, kept inside `workArea`. */
export function popoutBoundsAtPoint(point: Point, size: Size, workArea: Rect): Rect {
  return clampToWorkArea(
    { x: point.x - GRAB_OFFSET.x, y: point.y - GRAB_OFFSET.y, ...size },
    workArea,
    POPOUT_MIN_SIZE,
  );
}

/** Bounds for a pop-out opened from a menu: cascaded from the origin window, inside `workArea`. */
export function popoutBoundsNearWindow(origin: Rect, size: Size, workArea: Rect): Rect {
  return clampToWorkArea(
    { x: origin.x + CASCADE_OFFSET, y: origin.y + CASCADE_OFFSET, ...size },
    workArea,
    POPOUT_MIN_SIZE,
  );
}

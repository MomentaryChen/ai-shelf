/**
 * Pure geometry for placing windows across monitors. No Electron import so it
 * can be unit-tested with plain Node.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedWindowState extends Rect {
  isMaximized?: boolean;
}

/** Minimum visible strip of a window (title bar) for it to count as "on screen". */
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 40;

function intersection(a: Rect, b: Rect): { width: number; height: number } {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function area(r: { width: number; height: number }): number {
  return r.width * r.height;
}

/**
 * True when the window's title-bar strip (top 40px) is visible on some display,
 * so the user can still grab and move it.
 */
export function isTitleBarVisible(bounds: Rect, workAreas: Rect[]): boolean {
  const titleBar: Rect = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: MIN_VISIBLE_HEIGHT,
  };
  return workAreas.some((wa) => {
    const hit = intersection(titleBar, wa);
    return (
      hit.width >= Math.min(MIN_VISIBLE_WIDTH, bounds.width) && hit.height >= MIN_VISIBLE_HEIGHT
    );
  });
}

/** Work area overlapping the rect most; falls back to the one nearest its center. */
export function pickWorkArea(bounds: Rect, workAreas: Rect[]): Rect | null {
  if (workAreas.length === 0) return null;
  let best: Rect | null = null;
  let bestArea = 0;
  for (const wa of workAreas) {
    const a = area(intersection(bounds, wa));
    if (a > bestArea) {
      bestArea = a;
      best = wa;
    }
  }
  if (best) return best;

  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  let nearest: Rect = workAreas[0];
  let nearestDist = Infinity;
  for (const wa of workAreas) {
    const dx = Math.max(wa.x - cx, 0, cx - (wa.x + wa.width));
    const dy = Math.max(wa.y - cy, 0, cy - (wa.y + wa.height));
    const d = dx * dx + dy * dy;
    if (d < nearestDist) {
      nearestDist = d;
      nearest = wa;
    }
  }
  return nearest;
}

/** Shrink the size to fit the work area, then shift the rect fully inside it. */
export function clampToWorkArea(
  bounds: Rect,
  workArea: Rect,
  minSize?: { width: number; height: number },
): Rect {
  const width = Math.min(Math.max(bounds.width, minSize?.width ?? 0), workArea.width);
  const height = Math.min(Math.max(bounds.height, minSize?.height ?? 0), workArea.height);
  const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Center a size inside a rect (a work area or a parent window), clamped to the work area. */
export function centerIn(
  size: { width: number; height: number },
  anchor: Rect,
  workArea: Rect,
): Rect {
  const rect: Rect = {
    x: anchor.x + (anchor.width - size.width) / 2,
    y: anchor.y + (anchor.height - size.height) / 2,
    width: size.width,
    height: size.height,
  };
  return clampToWorkArea(rect, workArea);
}

function isFiniteRect(r: Partial<Rect> | null | undefined): r is Rect {
  return (
    !!r &&
    [r.x, r.y, r.width, r.height].every((v) => typeof v === "number" && Number.isFinite(v)) &&
    (r.width as number) > 0 &&
    (r.height as number) > 0
  );
}

/**
 * Decide where a window opens.
 * - Saved bounds still reachable on a connected display → keep them (clamped to that display).
 * - Saved bounds on a monitor that is gone → move onto the nearest display.
 * - Nothing saved → center the default size on the fallback work area (e.g. the cursor's display).
 */
export function resolveInitialBounds(opts: {
  saved: Partial<SavedWindowState> | null | undefined;
  defaults: { width: number; height: number };
  minSize?: { width: number; height: number };
  workAreas: Rect[];
  fallbackWorkArea: Rect;
}): Rect {
  const { saved, defaults, minSize, workAreas, fallbackWorkArea } = opts;
  if (isFiniteRect(saved)) {
    const target = pickWorkArea(saved, workAreas) ?? fallbackWorkArea;
    if (isTitleBarVisible(saved, workAreas)) {
      return clampToWorkArea(saved, target, minSize);
    }
    // Monitor disconnected / resolution changed: keep the size, center on the nearest display.
    return centerIn({ width: saved.width, height: saved.height }, target, target);
  }
  return centerIn(defaults, fallbackWorkArea, fallbackWorkArea);
}

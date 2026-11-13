/**
 * Terminal font zoom (Ctrl/Cmd + = / - / 0). Pure so it can be unit tested.
 *
 * Zoom is global: it rewrites `settings.terminalFontSize`, the same value the
 * settings slider edits, so every pane follows and the size persists. Reset goes
 * back to the app default, not to a per-session baseline.
 */

export type FontZoomDirection = "in" | "out" | "reset";

/** Same bounds `loadSettings` clamps `terminalFontSize` to. */
export const FONT_ZOOM_MIN = 8;
export const FONT_ZOOM_MAX = 32;
export const FONT_ZOOM_STEP = 1;

export function clampFontSize(size: number, min = FONT_ZOOM_MIN, max = FONT_ZOOM_MAX): number {
  if (!Number.isFinite(size)) return min;
  return Math.min(max, Math.max(min, Math.round(size)));
}

/** Next font size for a zoom step; `defaultSize` is used by reset. */
export function zoomFontSize(
  current: number,
  direction: FontZoomDirection,
  defaultSize: number,
): number {
  if (direction === "reset") return clampFontSize(defaultSize);
  const delta = direction === "in" ? FONT_ZOOM_STEP : -FONT_ZOOM_STEP;
  return clampFontSize(clampFontSize(current) + delta);
}

/**
 * How much unfocused split panes fade back — pure mapping, unit tested.
 *
 * Opacity applies to the pane body (the terminal) of every pane except the
 * focused one, only while several panes are on screen and neither broadcast
 * input nor a maximized pane is active (see SplitPaneLayout).
 *
 * - off:    1    (no body fade; the pane title still goes muted as a light cue)
 * - subtle: 0.9
 * - normal: 0.8  (default — the look before this setting existed)
 * - strong: 0.6
 */

export type UnfocusedPaneDim = "off" | "subtle" | "normal" | "strong";

export const UNFOCUSED_PANE_DIM_LEVELS: readonly UnfocusedPaneDim[] = [
  "off",
  "subtle",
  "normal",
  "strong",
];

export const DEFAULT_UNFOCUSED_PANE_DIM: UnfocusedPaneDim = "normal";

const OPACITY: Record<UnfocusedPaneDim, number> = {
  off: 1,
  subtle: 0.9,
  normal: 0.8,
  strong: 0.6,
};

export function isUnfocusedPaneDim(raw: unknown): raw is UnfocusedPaneDim {
  return typeof raw === "string" && (UNFOCUSED_PANE_DIM_LEVELS as readonly string[]).includes(raw);
}

/** Stored value → valid level; anything unknown falls back to the default. */
export function normalizeUnfocusedPaneDim(raw: unknown): UnfocusedPaneDim {
  return isUnfocusedPaneDim(raw) ? raw : DEFAULT_UNFOCUSED_PANE_DIM;
}

/** Body opacity for an unfocused pane at this level (invalid input → default level). */
export function unfocusedPaneDimOpacity(level: unknown): number {
  return OPACITY[normalizeUnfocusedPaneDim(level)];
}

/** Index of the current group, or 0 if the id is missing. */
export function groupIndexById(groups: readonly { id: string }[], currentId: string): number {
  const i = groups.findIndex((g) => g.id === currentId);
  return i < 0 ? 0 : i;
}

/** Step with wrap-around so the carousel cycles past the first and last item. */
export function stepIndex(length: number, current: number, delta: number): number {
  if (length <= 0) return 0;
  return ((current + delta) % length + length) % length;
}

/** True when a step wraps from one end of the list to the other. */
export function isWrapStep(length: number, current: number, next: number): boolean {
  if (length < 2) return false;
  return Math.abs(next - current) > 1;
}

/** Direction of a list step. Jumps farther than one item fade instead of sliding. */
export type SlideDirection = "next" | "prev" | "fade";

/**
 * Linear direction. A one-step move slides; a longer jump fades.
 * Wheel wrap on the workspace switcher passes an explicit direction instead.
 */
export function slideDirection(length: number, from: number, to: number): SlideDirection | null {
  if (length < 2 || from === to || from < 0 || to < 0 || from >= length || to >= length) {
    return null;
  }
  if (Math.abs(to - from) > 1) return "fade";
  return to > from ? "next" : "prev";
}

/** Slide direction between two ids. Missing ids fade; the same id does not animate. */
export function directionBetween(
  items: readonly { id: string }[],
  fromId: string | null,
  toId: string | null,
): SlideDirection | null {
  if (!fromId || !toId || fromId === toId) return null;
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0) return "fade";
  return slideDirection(items.length, from, to);
}

/**
 * Enter class for a slide. Odd epochs use an `-alt` class with the same
 * keyframes so a repeated direction still restarts the animation.
 */
export function slideClassName(
  direction: SlideDirection | null,
  prefix = "profile-slide",
  epoch = 0,
): string {
  if (!direction) return "";
  const alt = epoch % 2 === 1 ? "-alt" : "";
  return `${prefix}-${direction}${alt}`;
}

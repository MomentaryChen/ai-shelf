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

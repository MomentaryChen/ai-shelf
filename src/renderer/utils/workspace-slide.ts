/** Index of the current group, or 0 if the id is missing. */
export function groupIndexById(groups: readonly { id: string }[], currentId: string): number {
  const i = groups.findIndex((g) => g.id === currentId);
  return i < 0 ? 0 : i;
}

/** Clamp a step so the carousel stops at the first and last item (no wrap). */
export function stepIndex(length: number, current: number, delta: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, current + delta));
}

/** Move item at dragId to the index of dropId (same splice semantics as profile reorder). */
export function reorderById<T>(
  items: readonly T[],
  dragId: string,
  dropId: string,
  getId: (item: T) => string,
): T[] | null {
  if (dragId === dropId) return null;
  const ids = items.map(getId);
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(dropId);
  if (from < 0 || to < 0) return null;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

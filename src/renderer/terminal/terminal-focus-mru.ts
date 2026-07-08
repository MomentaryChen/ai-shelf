/** A focused terminal pane, scoped to workspace + profile. */
export interface TerminalFocusRef {
  workspaceId: string;
  profileId: string;
  paneId: string;
}

export function terminalFocusKey(ref: TerminalFocusRef): string {
  return `${ref.workspaceId}:${ref.profileId}:${ref.paneId}`;
}

export function terminalFocusRefsEqual(a: TerminalFocusRef, b: TerminalFocusRef): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.profileId === b.profileId &&
    a.paneId === b.paneId
  );
}

export function pushTerminalFocusMru(
  mru: TerminalFocusRef[],
  ref: TerminalFocusRef,
  max = 64,
): TerminalFocusRef[] {
  const key = terminalFocusKey(ref);
  const next = [ref, ...mru.filter((r) => terminalFocusKey(r) !== key)];
  return next.slice(0, max);
}

/** Previous live terminal in MRU (skips current and entries missing from `live`). */
export function previousTerminalFocus(
  mru: TerminalFocusRef[],
  current: TerminalFocusRef | null,
  live: (ref: TerminalFocusRef) => boolean,
): TerminalFocusRef | null {
  for (const ref of mru) {
    if (current && terminalFocusRefsEqual(ref, current)) continue;
    if (!live(ref)) continue;
    return ref;
  }
  return null;
}

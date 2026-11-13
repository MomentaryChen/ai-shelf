/**
 * Bookkeeping for popped-out terminal panes: which pane lives in which pop-out
 * window and which window it came from. Window handles stay in the Electron
 * glue (popout-window.ts); this only tracks ids so it can be unit-tested.
 */

/** Pane fields the pop-out window needs to render its terminal. */
export interface PopoutPaneInfo {
  id: string;
  tool: string;
  sessionId: string;
  cwd: string;
  title?: string;
  agentSessionId?: string;
}

export interface PopoutEntry {
  pane: PopoutPaneInfo;
  /** Header / window title (numbered label from the origin window). */
  label: string;
  accentColor: string | null;
  /** webContents id of the pop-out window. */
  popoutId: number;
  /** webContents id of the window the pane was popped out of. */
  originId: number;
  /** Agent in the pane is running / waiting — reported by the origin window. */
  busy: boolean;
}

export class PopoutRegistry {
  private readonly byPaneId = new Map<string, PopoutEntry>();

  add(entry: PopoutEntry): void {
    this.byPaneId.set(entry.pane.id, entry);
  }

  remove(paneId: string): PopoutEntry | null {
    const entry = this.byPaneId.get(paneId) ?? null;
    this.byPaneId.delete(paneId);
    return entry;
  }

  byPane(paneId: string): PopoutEntry | null {
    return this.byPaneId.get(paneId) ?? null;
  }

  bySession(sessionId: string): PopoutEntry | null {
    for (const entry of this.byPaneId.values()) {
      if (entry.pane.sessionId === sessionId) return entry;
    }
    return null;
  }

  byPopout(popoutId: number): PopoutEntry | null {
    for (const entry of this.byPaneId.values()) {
      if (entry.popoutId === popoutId) return entry;
    }
    return null;
  }

  byOrigin(originId: number): PopoutEntry[] {
    return [...this.byPaneId.values()].filter((e) => e.originId === originId);
  }

  /** Busy flag from the origin; only the origin of that pane may set it. */
  setBusy(paneId: string, busy: boolean, reporterId: number): boolean {
    const entry = this.byPaneId.get(paneId);
    if (!entry || entry.originId !== reporterId) return false;
    entry.busy = busy;
    return true;
  }

  updateCwd(paneId: string, cwd: string): void {
    const entry = this.byPaneId.get(paneId);
    if (entry) entry.pane = { ...entry.pane, cwd };
  }

  all(): PopoutEntry[] {
    return [...this.byPaneId.values()];
  }
}

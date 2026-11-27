/**
 * Bookkeeping for profile "views": extra windows that each show some panes of
 * one profile. The origin window (main / chat) declares its views; main keeps
 * the latest declaration per view plus the window showing it. Ids only — the
 * BrowserWindow handles stay in pane-view-windows.ts — so this is unit-testable.
 */
import type { Rect } from "./window-bounds.js";

export interface ViewPaneDecl {
  id: string;
  tool: string;
  sessionId: string;
  cwd: string;
  title?: string;
  agentSessionId?: string;
}

export type ViewLayoutDecl =
  | { kind: "pane"; pane: ViewPaneDecl }
  | {
      kind: "split";
      id: string;
      direction: "horizontal" | "vertical";
      ratio: number;
      first: ViewLayoutDecl;
      second: ViewLayoutDecl;
    };

/** Mirrors `PaneAgentStatus` in src/shared/pane-agent-state.ts. */
export type ViewPaneAgentStatus = "idle" | "running" | "waiting_input" | "stalled";

/** What the origin window says one view should look like. */
export interface PaneViewDecl {
  viewId: string;
  /** `${workspaceId}:${profileId}` */
  profileKey: string;
  profileName: string;
  accentColor: string | null;
  layout: ViewLayoutDecl;
  focusedPaneId: string | null;
  /** Pane id → header label. */
  labels: Record<string, string>;
  /** Pane id → agent running / waiting (drives the close confirm). */
  busy: Partial<Record<string, boolean>>;
  /** Pane id → live agent status light (non-idle only; same as the origin sidebar). */
  agentStatus?: Partial<Record<string, ViewPaneAgentStatus>>;
  /** Saved window bounds (used only when the window is created). */
  bounds: Rect | null;
  /** Installed tool ids the view's "New terminal" menu offers (plain shell is always offered). */
  tools: string[];
  /** Panes closed in this view that can be reopened (enables its "Reopen closed pane"). */
  closedPaneCount?: number;
}

export interface PaneViewEntry {
  decl: PaneViewDecl;
  originId: number;
  /** webContents id of the view window. */
  windowId: number;
}

export function collectDeclPanes(node: ViewLayoutDecl): ViewPaneDecl[] {
  if (node.kind === "pane") return [node.pane];
  return [...collectDeclPanes(node.first), ...collectDeclPanes(node.second)];
}

export class PaneViewRegistry {
  private readonly views = new Map<string, PaneViewEntry>();

  set(entry: PaneViewEntry): void {
    this.views.set(entry.decl.viewId, entry);
  }

  remove(viewId: string): PaneViewEntry | null {
    const entry = this.views.get(viewId) ?? null;
    this.views.delete(viewId);
    return entry;
  }

  byView(viewId: string): PaneViewEntry | null {
    return this.views.get(viewId) ?? null;
  }

  byWindow(windowId: number): PaneViewEntry | null {
    for (const entry of this.views.values()) {
      if (entry.windowId === windowId) return entry;
    }
    return null;
  }

  byOrigin(originId: number): PaneViewEntry[] {
    return [...this.views.values()].filter((e) => e.originId === originId);
  }

  /** View currently showing the pane (a pane is in at most one view). */
  byPane(paneId: string): PaneViewEntry | null {
    for (const entry of this.views.values()) {
      if (collectDeclPanes(entry.decl.layout).some((p) => p.id === paneId)) return entry;
    }
    return null;
  }

  sessionsOf(viewId: string): string[] {
    const entry = this.views.get(viewId);
    return entry ? collectDeclPanes(entry.decl.layout).map((p) => p.sessionId) : [];
  }

  /** True when any pane in the view has a busy agent. */
  anyBusy(viewId: string): boolean {
    const entry = this.views.get(viewId);
    if (!entry) return false;
    return collectDeclPanes(entry.decl.layout).some((p) => entry.decl.busy[p.id] === true);
  }

  all(): PaneViewEntry[] {
    return [...this.views.values()];
  }
}

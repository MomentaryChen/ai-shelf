import type { PaneInfo } from "./split-tree";

export type PaneShortcutAction =
  | { type: "focus-next" }
  | { type: "focus-prev" }
  | { type: "focus-index"; index: number }
  | { type: "close" }
  | { type: "split"; direction: "horizontal" | "vertical" };

function hasMod(ev: KeyboardEvent): boolean {
  return ev.ctrlKey || ev.metaKey;
}

/** Sidebar / profile forms — not xterm's hidden textarea. */
function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".xterm")) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

function applyPaneShortcutAction(
  action: PaneShortcutAction,
  h: PaneShortcutHandlers,
): void {
  const { panes, focusedPaneId, onFocusPane, onClosePane, onSplitPane } = h;
  if (panes.length === 0) return;

  const focusId = focusedPaneId ?? panes[0]!.id;

  switch (action.type) {
    case "focus-next": {
      const id = cyclePaneId(panes, focusedPaneId, "next");
      if (id) onFocusPane(id);
      break;
    }
    case "focus-prev": {
      const id = cyclePaneId(panes, focusedPaneId, "prev");
      if (id) onFocusPane(id);
      break;
    }
    case "focus-index": {
      const id = paneIdAtIndex(panes, action.index);
      if (id) onFocusPane(id);
      break;
    }
    case "close":
      onClosePane(focusId);
      break;
    case "split":
      onSplitPane(focusId, action.direction);
      break;
  }
}

export interface PaneShortcutHandlers {
  panes: PaneInfo[];
  focusedPaneId: string | null;
  enabled?: boolean;
  onFocusPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onSplitPane: (paneId: string, direction: "horizontal" | "vertical") => void;
}

let getHandlers: (() => PaneShortcutHandlers | null) | null = null;

export function registerPaneShortcutHandlers(
  source: (() => PaneShortcutHandlers | null) | null,
): void {
  getHandlers = source;
}

/** Returns a pane action when the event matches a global pane shortcut. */
export function matchPaneShortcut(ev: KeyboardEvent): PaneShortcutAction | null {
  if (ev.type !== "keydown" || !hasMod(ev) || ev.altKey) return null;
  if (shouldIgnoreShortcutTarget(ev.target)) return null;

  const key = ev.key.toLowerCase();

  if (!ev.shiftKey && key === "tab") {
    return { type: "focus-next" };
  }
  if (ev.shiftKey && key === "tab") {
    return { type: "focus-prev" };
  }

  if (!ev.shiftKey && key === "w") {
    return { type: "close" };
  }

  if (!ev.shiftKey && (key === "\\" || key === "|")) {
    return { type: "split", direction: "horizontal" };
  }
  if (ev.shiftKey && (key === "\\" || key === "|")) {
    return { type: "split", direction: "vertical" };
  }

  if (!ev.shiftKey && key >= "1" && key <= "9") {
    return { type: "focus-index", index: Number(key) - 1 };
  }

  return null;
}

/**
 * Consume a pane shortcut (window capture or xterm custom key handler).
 * Returns true when the key was handled.
 */
export function tryConsumePaneShortcut(ev: KeyboardEvent): boolean {
  const h = getHandlers?.();
  if (!h || h.enabled === false) return false;

  const action = matchPaneShortcut(ev);
  if (!action) return false;

  ev.preventDefault();
  ev.stopImmediatePropagation();
  applyPaneShortcutAction(action, h);
  return true;
}

export function cyclePaneId(
  panes: PaneInfo[],
  currentId: string | null,
  direction: "next" | "prev",
): string | null {
  if (panes.length === 0) return null;
  const idx = currentId ? panes.findIndex((p) => p.id === currentId) : -1;
  const base = idx >= 0 ? idx : 0;
  const delta = direction === "next" ? 1 : -1;
  const next = (base + delta + panes.length) % panes.length;
  return panes[next]!.id;
}

export function paneIdAtIndex(panes: PaneInfo[], index: number): string | null {
  if (index < 0 || index >= panes.length) return null;
  return panes[index]!.id;
}

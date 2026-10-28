import type { PaneInfo } from "./split-tree";
import { shouldIgnoreShortcutForIme } from "./ime-keys";
import { getActiveKeybindings } from "../shortcuts/active-keybindings";
import {
  matchShortcut,
  type KeybindingMap,
  type KeyEventLike,
  type ShortcutId,
} from "../shortcuts/keybindings";

export type PaneShortcutAction =
  | { type: "focus-next" }
  | { type: "focus-prev" }
  | { type: "focus-index"; index: number }
  | { type: "close" }
  | { type: "clear-screen" }
  | { type: "restart-session" }
  | { type: "split"; direction: "horizontal" | "vertical" };

/** Sidebar / profile forms — not xterm's hidden textarea. */
function shouldIgnoreShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".xterm")) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

function isXtermTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object" || !("closest" in target)) return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== "function") return false;
  return Boolean(closest.call(target, ".xterm"));
}

/** Apply a matched pane shortcut. Exported for unit tests. */
export function applyPaneShortcutAction(action: PaneShortcutAction, h: PaneShortcutHandlers): void {
  const {
    panes,
    focusedPaneId,
    onFocusPane,
    onFocusRecentTerminal,
    onClosePane,
    onSplitPane,
    onClearPane,
    onRestartPane,
  } = h;

  // Ctrl+Tab MRU must work with zero local panes (e.g. empty workspace after a
  // group switch) so focus can jump back across profiles/workspaces.
  if (action.type === "focus-next" && onFocusRecentTerminal) {
    onFocusRecentTerminal();
    return;
  }

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
    case "clear-screen":
      onClearPane?.(focusId);
      break;
    case "restart-session":
      onRestartPane?.(focusId);
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
  /** Ctrl+Tab — jump to previous terminal in global MRU (cross profile/workspace). */
  onFocusRecentTerminal?: () => void;
  onClosePane: (paneId: string) => void;
  onClearPane?: (paneId: string) => void;
  onRestartPane?: (paneId: string) => void;
  onSplitPane: (paneId: string, direction: "horizontal" | "vertical") => void;
}

let getHandlers: (() => PaneShortcutHandlers | null) | null = null;

export function registerPaneShortcutHandlers(
  source: (() => PaneShortcutHandlers | null) | null,
): void {
  getHandlers = source;
}

const PANE_SHORTCUT_IDS: readonly ShortcutId[] = [
  "focusNext",
  "focusPrev",
  "splitHorizontal",
  "splitVertical",
  "focusPane",
  "closePane",
  "clearScreen",
  "restartSession",
];

/** Default close chord is Ctrl/Cmd+W. Inside a terminal that chord is the shell's delete-word. */
function closeIsDefaultModW(map: KeybindingMap): boolean {
  const close = map.closePane;
  return (
    !!close &&
    close.key === "w" &&
    close.mod === true &&
    !close.shift &&
    !close.alt &&
    !close.ctrl &&
    !close.meta
  );
}

function isPlainCtrlW(ev: KeyEventLike): boolean {
  return (
    ev.type !== "keyup" &&
    ev.ctrlKey &&
    !ev.metaKey &&
    !ev.shiftKey &&
    !ev.altKey &&
    ev.key.toLowerCase() === "w"
  );
}

function isCtrlShiftW(ev: KeyEventLike): boolean {
  return (
    ev.type !== "keyup" &&
    ev.ctrlKey &&
    !ev.metaKey &&
    ev.shiftKey &&
    !ev.altKey &&
    ev.key.toLowerCase() === "w"
  );
}

/**
 * Map a key event to a pane action using the given keybindings (pure; unit tested).
 *
 * While close is still the default Ctrl/Cmd+W:
 * - Ctrl+Shift+W closes the pane (including inside the terminal)
 * - plain Ctrl+W inside xterm is left for the shell (delete previous word)
 * - Cmd+W and Ctrl+W outside xterm still close
 * A rebound or disabled close shortcut is honored as-is, including inside xterm.
 */
export function matchPaneShortcutWithBindings(
  ev: KeyEventLike,
  map: KeybindingMap,
  target?: EventTarget | null,
): PaneShortcutAction | null {
  if (closeIsDefaultModW(map) && isCtrlShiftW(ev)) {
    return { type: "close" };
  }
  if (closeIsDefaultModW(map) && isPlainCtrlW(ev) && isXtermTarget(target ?? null)) {
    return null;
  }

  const m = matchShortcut(ev, map, PANE_SHORTCUT_IDS);
  if (!m) return null;
  switch (m.id) {
    case "focusNext":
      return { type: "focus-next" };
    case "focusPrev":
      return { type: "focus-prev" };
    case "splitHorizontal":
      return { type: "split", direction: "horizontal" };
    case "splitVertical":
      return { type: "split", direction: "vertical" };
    case "focusPane":
      return { type: "focus-index", index: m.index ?? 0 };
    case "closePane":
      return { type: "close" };
    case "clearScreen":
      return { type: "clear-screen" };
    case "restartSession":
      return { type: "restart-session" };
    default:
      return null;
  }
}

/** Returns a pane action when the event matches a global pane shortcut. */
export function matchPaneShortcut(ev: KeyboardEvent): PaneShortcutAction | null {
  if (ev.type !== "keydown") return null;
  if (shouldIgnoreShortcutTarget(ev.target)) return null;
  return matchPaneShortcutWithBindings(ev, getActiveKeybindings(), ev.target);
}

/**
 * Consume a pane shortcut (window capture or xterm custom key handler).
 * Returns true when the key was handled.
 */
export function tryConsumePaneShortcut(ev: KeyboardEvent): boolean {
  const h = getHandlers?.();
  if (!h || h.enabled === false) return false;
  if (shouldIgnoreShortcutForIme(ev)) return false;

  const action = matchPaneShortcut(ev);
  if (!action) return false;
  if (!shouldConsumePaneShortcut(action, h)) return false;

  ev.preventDefault();
  ev.stopImmediatePropagation();
  applyPaneShortcutAction(action, h);
  return true;
}

/** Whether a matched action should run (and consume the key) for the current handlers. */
export function shouldConsumePaneShortcut(
  action: PaneShortcutAction,
  h: Pick<PaneShortcutHandlers, "panes" | "onFocusRecentTerminal">,
): boolean {
  // Empty layout: only Ctrl+Tab MRU is meaningful. Do not swallow Ctrl+W / 1–9 /
  // split keys — those may belong to profile quick-switch or should no-op cleanly.
  if (h.panes.length === 0) {
    return action.type === "focus-next" && Boolean(h.onFocusRecentTerminal);
  }
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

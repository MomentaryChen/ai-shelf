import { useEffect, useRef } from "react";
import type { PaneInfo, SplitDirection } from "../terminal/split-tree";
import {
  registerPaneShortcutHandlers,
  tryConsumePaneShortcut,
  type PaneShortcutHandlers,
} from "../terminal/pane-shortcuts";

export type { PaneShortcutHandlers };

/**
 * Global pane shortcuts: window capture + xterm custom key handler (terminal focused).
 */
export function usePaneShortcuts(handlers: PaneShortcutHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    registerPaneShortcutHandlers(() => ref.current);
    return () => registerPaneShortcutHandlers(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      tryConsumePaneShortcut(ev);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

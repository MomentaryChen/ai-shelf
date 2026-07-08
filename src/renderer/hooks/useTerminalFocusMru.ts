import { useCallback, useEffect, useRef } from "react";
import type { ProfileInfo } from "../types";
import {
  previousTerminalFocus,
  pushTerminalFocusMru,
  type TerminalFocusRef,
} from "../terminal/terminal-focus-mru";

export interface TerminalFocusMruHandlers {
  activeProfile: ProfileInfo | null;
  focusedPaneId: string | null;
  isPaneLive: (ref: TerminalFocusRef) => boolean;
  onActivate: (ref: TerminalFocusRef) => void | Promise<void>;
  enabled?: boolean;
}

/**
 * Tracks recently focused terminals across profiles/workspaces.
 * Ctrl+Tab (focus-next) jumps to the previous live terminal in MRU.
 */
export function useTerminalFocusMru(handlers: TerminalFocusMruHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const mruRef = useRef<TerminalFocusRef[]>([]);
  const activatingRef = useRef(false);

  const recordCurrentFocus = useCallback(() => {
    const h = ref.current;
    const profile = h.activeProfile;
    const paneId = h.focusedPaneId;
    if (!profile || !paneId) return;
    const entry: TerminalFocusRef = {
      workspaceId: profile.workspaceId,
      profileId: profile.id,
      paneId,
    };
    if (!h.isPaneLive(entry)) return;
    mruRef.current = pushTerminalFocusMru(mruRef.current, entry);
  }, []);

  useEffect(() => {
    recordCurrentFocus();
  }, [handlers.activeProfile?.id, handlers.focusedPaneId, recordCurrentFocus]);

  const focusPreviousTerminal = useCallback(async () => {
    const h = ref.current;
    if (h.enabled === false || activatingRef.current) return;

    const profile = h.activeProfile;
    const current: TerminalFocusRef | null =
      profile && h.focusedPaneId
        ? {
            workspaceId: profile.workspaceId,
            profileId: profile.id,
            paneId: h.focusedPaneId,
          }
        : null;

    const target = previousTerminalFocus(mruRef.current, current, h.isPaneLive);
    if (!target) return;
    if (
      current &&
      current.workspaceId === target.workspaceId &&
      current.profileId === target.profileId &&
      current.paneId === target.paneId
    ) {
      return;
    }

    activatingRef.current = true;
    try {
      await Promise.resolve(h.onActivate(target));
    } finally {
      activatingRef.current = false;
    }
  }, []);

  return { focusPreviousTerminal, recordCurrentFocus };
}

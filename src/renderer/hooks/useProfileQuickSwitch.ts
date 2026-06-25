import { useEffect, useRef } from "react";
import type { ProfileInfo } from "../types";
import {
  cycleProfileMru,
  matchProfileQuickSwitch,
  pushProfileMru,
} from "../profile-quick-switch";

export interface ProfileQuickSwitchHandlers {
  /** Profiles in the current workspace group (1–9 order; unaffected by sidebar search). */
  groupProfiles: ProfileInfo[];
  /** All profiles for MRU lookup across groups. */
  allProfiles: ProfileInfo[];
  activeProfileId: string | null;
  enabled?: boolean;
  onActivate: (profile: ProfileInfo) => void | Promise<void>;
}

/**
 * Ctrl+1–9 (outside terminal) switches profile by sidebar order.
 * Ctrl+` / Ctrl+Shift+` cycles recently used profiles.
 */
export function useProfileQuickSwitch(handlers: ProfileQuickSwitchHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const mruRef = useRef<string[]>([]);
  const activatingRef = useRef(false);

  useEffect(() => {
    const id = ref.current.activeProfileId;
    if (id) mruRef.current = pushProfileMru(mruRef.current, id);
  }, [handlers.activeProfileId]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const h = ref.current;
      if (h.enabled === false || activatingRef.current) return;

      const action = matchProfileQuickSwitch(ev);
      if (!action) return;

      ev.preventDefault();
      ev.stopImmediatePropagation();

      const activate = (profile: ProfileInfo) => {
        if (profile.id === h.activeProfileId) return;
        activatingRef.current = true;
        void Promise.resolve(h.onActivate(profile)).finally(() => {
          activatingRef.current = false;
        });
      };

      if (action.type === "by-index") {
        const profile = h.groupProfiles[action.index];
        if (profile) activate(profile);
        return;
      }

      const nextId = cycleProfileMru(mruRef.current, h.activeProfileId, action.direction);
      if (!nextId || nextId === h.activeProfileId) return;
      const profile = h.allProfiles.find((p) => p.id === nextId);
      if (profile) activate(profile);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

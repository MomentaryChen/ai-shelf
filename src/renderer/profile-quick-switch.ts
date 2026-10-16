import { shouldIgnoreShortcutForIme } from "./terminal/ime-keys";
import { getActiveKeybindings } from "./shortcuts/active-keybindings";
import { matchShortcut, type KeybindingMap, type KeyEventLike } from "./shortcuts/keybindings";

export type ProfileQuickSwitchAction =
  | { type: "by-index"; index: number }
  | { type: "cycle"; direction: "next" | "prev" };

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

function inXterm(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(".xterm"));
}

/**
 * Map a key event to a profile switch using the given keybindings (pure; unit tested).
 * `inXterm`: by-index switching is skipped inside the terminal (panes keep 1–9).
 */
export function matchProfileQuickSwitchWithBindings(
  ev: KeyEventLike,
  map: KeybindingMap,
  inXterm: boolean,
): ProfileQuickSwitchAction | null {
  const cycle = matchShortcut(ev, map, ["profileCycleNext", "profileCyclePrev"]);
  if (cycle) {
    return { type: "cycle", direction: cycle.id === "profileCycleNext" ? "next" : "prev" };
  }
  if (inXterm) return null;
  const byIndex = matchShortcut(ev, map, ["profileByIndex"]);
  if (byIndex) return { type: "by-index", index: byIndex.index ?? 0 };
  return null;
}

/** Returns a profile switch action when the event matches a profile shortcut. */
export function matchProfileQuickSwitch(ev: KeyboardEvent): ProfileQuickSwitchAction | null {
  if (ev.type !== "keydown") return null;
  if (shouldIgnoreShortcutForIme(ev)) return null;
  if (shouldIgnoreTarget(ev.target)) return null;
  return matchProfileQuickSwitchWithBindings(ev, getActiveKeybindings(), inXterm(ev.target));
}

export function pushProfileMru(mru: string[], profileId: string, max = 32): string[] {
  const next = [profileId, ...mru.filter((id) => id !== profileId)];
  return next.slice(0, max);
}

export function cycleProfileMru(
  mru: string[],
  currentId: string | null,
  direction: "next" | "prev",
): string | null {
  if (mru.length === 0) return null;
  const idx = currentId ? mru.indexOf(currentId) : -1;
  if (idx < 0) {
    return direction === "next" ? mru[0]! : mru[mru.length - 1]!;
  }
  const delta = direction === "next" ? 1 : -1;
  return mru[(idx + delta + mru.length) % mru.length]!;
}

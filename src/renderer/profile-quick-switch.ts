export type ProfileQuickSwitchAction =
  | { type: "by-index"; index: number }
  | { type: "cycle"; direction: "next" | "prev" };

function hasMod(ev: KeyboardEvent): boolean {
  return ev.ctrlKey || ev.metaKey;
}

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

/** Returns a profile switch action when the event matches a profile shortcut. */
export function matchProfileQuickSwitch(ev: KeyboardEvent): ProfileQuickSwitchAction | null {
  if (ev.type !== "keydown" || !hasMod(ev) || ev.altKey) return null;
  if (shouldIgnoreTarget(ev.target)) return null;

  // Ctrl+` / Ctrl+Shift+` — cycle recent profiles (anywhere except form fields).
  if (ev.code === "Backquote") {
    return { type: "cycle", direction: ev.shiftKey ? "prev" : "next" };
  }

  // Ctrl+1–9 — switch to profile by sidebar order (outside xterm only; panes keep 1–9).
  if (inXterm(ev.target) || ev.shiftKey) return null;
  const key = ev.key;
  if (key >= "1" && key <= "9") {
    return { type: "by-index", index: Number(key) - 1 };
  }

  return null;
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

export function modLabel(): string {
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || "");
  return isMac ? "Cmd" : "Ctrl";
}

export function formatProfileQuickSwitchLabels(): {
  profileByIndex: string;
  profileCycle: string;
  profileCyclePrev: string;
} {
  const mod = modLabel();
  return {
    profileByIndex: `${mod}+1–9`,
    profileCycle: `${mod}+\``,
    profileCyclePrev: `${mod}+Shift+\``,
  };
}

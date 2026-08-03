/**
 * IME / composition key helpers for terminal shortcut handlers.
 *
 * During CJK IME sessions Chromium reports keydown with `isComposing` and/or
 * `keyCode === 229` ("Process"). Shortcuts must not consume those events, or
 * Space/Enter used to commit candidates never reaches the IME / xterm
 * CompositionHelper — which looks like the AI prompt box ignoring all input.
 */

export interface ImeKeyLike {
  type: string;
  isComposing?: boolean;
  keyCode?: number;
}

/** True while an IME composition is active (Space/Enter commit included). */
export function isImeComposingKey(ev: ImeKeyLike): boolean {
  return ev.isComposing === true;
}

/**
 * Synthetic "Process" keyCode Chromium uses for keys handled inside an IME
 * session (often before `isComposing` is set on the first key of a sequence).
 */
export function isImeProcessKey(ev: ImeKeyLike): boolean {
  return ev.keyCode === 229;
}

/**
 * Whether a custom xterm key handler should refuse the event so CompositionHelper
 * (and the browser IME) own it. Only active composition is refused — bare
 * keyCode 229 still returns through to xterm so textarea-diff bookkeeping runs.
 */
export function shouldDeferImeKeyToXterm(ev: ImeKeyLike): boolean {
  return ev.type === "keydown" && isImeComposingKey(ev);
}

/** Shortcuts must not preventDefault / steal keys during IME. */
export function shouldIgnoreShortcutForIme(ev: ImeKeyLike): boolean {
  return isImeComposingKey(ev) || isImeProcessKey(ev);
}

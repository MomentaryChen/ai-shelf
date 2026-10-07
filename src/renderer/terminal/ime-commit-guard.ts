/**
 * Rescue CJK commits that xterm drops around a window switch.
 *
 * Failure mode (Chromium + xterm 6.1):
 *   compositionend → CompositionHelper schedules setTimeout(0) to read
 *   textarea.value → blur runs in between and `_handleTextAreaBlur` clears
 *   the textarea → the timeout reads "" and never calls triggerDataEvent.
 *
 * The drop has no repro that survives a debugger (timing), which is why the
 * earlier delivery-path attempts missed. This guard:
 *   1. Remembers where each composition starts in xterm's helper textarea,
 *      which keeps earlier commits until the next blur.
 *   2. On blur inside a pending finalize, restores textarea.value after
 *      xterm's clearer so the scheduled finalize still sees the commit.
 *   3. As a backstop, if that blur still left onData without the commit,
 *      injects it once.
 *
 * It never injects outside that window. Without a blur xterm delivers the
 * commit itself (including the Enter path, which sends before compositionend),
 * and a blur *before* compositionend is an OS cancel: IMEs such as Zhuyin keep
 * their buffer and re-offer it on refocus, so injecting it would type the
 * sentence twice.
 *
 * Position pinning stays in `./xterm-ime-anchor`; this only owns delivery.
 * Pure state helpers below are unit-tested without a DOM.
 */

import type { Terminal } from "@xterm/xterm";

export type ImeCommitGuardState = {
  composing: boolean;
  /** Blur arrived mid-composition; the matching compositionend is not a commit. */
  canceledByBlur: boolean;
  /** Textarea index where the current composition began. */
  compositionStart: number;
  expectingFinalize: boolean;
  blurredDuringFinalize: boolean;
  /** This composition's text only — never earlier commits left in the textarea. */
  pendingCommit: string;
  /** Full textarea value seen at blur capture, for xterm's positional slice. */
  restoreValue: string;
  sentSinceFinalize: boolean;
};

export function createImeCommitGuardState(): ImeCommitGuardState {
  return {
    composing: false,
    canceledByBlur: false,
    compositionStart: 0,
    expectingFinalize: false,
    blurredDuringFinalize: false,
    pendingCommit: "",
    restoreValue: "",
    sentSinceFinalize: false,
  };
}

function resetFinalize(state: ImeCommitGuardState): void {
  state.expectingFinalize = false;
  state.blurredDuringFinalize = false;
  state.pendingCommit = "";
  state.restoreValue = "";
  state.sentSinceFinalize = false;
}

export function noteCompositionStart(state: ImeCommitGuardState, start: number): void {
  state.composing = true;
  state.canceledByBlur = false;
  state.compositionStart = Math.max(0, start);
}

export function noteCompositionEnd(
  state: ImeCommitGuardState,
  textareaValue: string,
  data: string,
): void {
  const canceled = state.canceledByBlur || !state.composing;
  state.composing = false;
  state.canceledByBlur = false;
  resetFinalize(state);
  if (canceled) return;
  state.pendingCommit = textareaValue.slice(state.compositionStart) || data;
  state.expectingFinalize = true;
}

/** Capture-phase blur: snapshot before xterm clears the textarea. */
export function noteBlurCapture(state: ImeCommitGuardState, textareaValue: string): void {
  if (state.composing) state.canceledByBlur = true;
  if (!state.expectingFinalize) return;
  state.blurredDuringFinalize = true;
  state.restoreValue = textareaValue;
}

/**
 * Bubble-phase blur: value to write back after xterm's clearer, or null when
 * there is nothing to restore.
 */
export function restoreValueAfterBlur(state: ImeCommitGuardState): string | null {
  if (!state.expectingFinalize || !state.blurredDuringFinalize) return null;
  if (!state.restoreValue || !state.pendingCommit) return null;
  return state.restoreValue;
}

/** Watch xterm onData during the finalize window so we do not double-inject. */
export function noteCommitDelivered(state: ImeCommitGuardState, data: string): void {
  if (!data || !state.expectingFinalize || !state.pendingCommit) return;
  if (data.includes(state.pendingCommit) || state.pendingCommit.includes(data)) {
    state.sentSinceFinalize = true;
  }
}

/**
 * After the finalize delay: text to inject once if a blur made xterm drop it,
 * else null. Clears the finalize window either way.
 */
export function takeFinalizeRescue(state: ImeCommitGuardState): string | null {
  const rescue =
    state.blurredDuringFinalize && !state.sentSinceFinalize && state.pendingCommit
      ? state.pendingCommit
      : null;
  resetFinalize(state);
  return rescue;
}

export type AttachImeCommitGuardOptions = {
  /** Override the finalize wait (tests). Default matches xterm's setTimeout(0). */
  finalizeDelayMs?: number;
};

export function attachImeCommitGuard(
  terminal: Terminal,
  options: AttachImeCommitGuardOptions = {},
): () => void {
  const root = terminal.element;
  if (!root) return () => {};

  const textarea = root.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
  if (!textarea) return () => {};

  const finalizeDelayMs = options.finalizeDelayMs ?? 0;
  const state = createImeCommitGuardState();
  let finalizeTimer = 0;

  const fromTextarea = (ev: Event): boolean => ev.target === textarea;

  const onCompositionStart = (ev: Event) => {
    if (!fromTextarea(ev)) return;
    // Same anchor xterm's CompositionHelper slices from.
    const start = Math.min(
      textarea.selectionStart ?? textarea.value.length,
      textarea.selectionEnd ?? textarea.value.length,
    );
    noteCompositionStart(state, start);
  };

  // Target-phase on the textarea, registered after xterm.open(), so this runs
  // *after* CompositionHelper.compositionend schedules its setTimeout(0). Our
  // rescue timer is therefore queued behind xterm's finalize and cannot inject
  // before it.
  const onCompositionEnd = (ev: Event) => {
    noteCompositionEnd(state, textarea.value, (ev as CompositionEvent).data ?? "");

    window.clearTimeout(finalizeTimer);
    finalizeTimer = window.setTimeout(() => {
      const commit = takeFinalizeRescue(state);
      if (!commit) return;
      try {
        terminal.input(commit);
      } catch {
        /* terminal may be disposing */
      }
    }, finalizeDelayMs);
  };

  const onBlurCapture = (ev: Event) => {
    if (!fromTextarea(ev)) return;
    noteBlurCapture(state, textarea.value);
  };

  // Bubble phase runs after xterm's target-phase clearer — put the commit back
  // so CompositionHelper's setTimeout(0) still reads it.
  const onBlurBubble = (ev: Event) => {
    if (!fromTextarea(ev)) return;
    const restore = restoreValueAfterBlur(state);
    if (restore == null || textarea.value === restore) return;
    textarea.value = restore;
  };

  const dataDisposable = terminal.onData((data) => {
    noteCommitDelivered(state, data);
  });

  root.addEventListener("compositionstart", onCompositionStart, true);
  textarea.addEventListener("compositionend", onCompositionEnd);
  textarea.addEventListener("blur", onBlurCapture, true);
  textarea.addEventListener("blur", onBlurBubble, false);

  return () => {
    window.clearTimeout(finalizeTimer);
    dataDisposable.dispose();
    root.removeEventListener("compositionstart", onCompositionStart, true);
    textarea.removeEventListener("compositionend", onCompositionEnd);
    textarea.removeEventListener("blur", onBlurCapture, true);
    textarea.removeEventListener("blur", onBlurBubble, false);
  };
}

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
 *   1. Snapshots composition text on compositionupdate / compositionend.
 *   2. On blur, if a finalize is pending, restores textarea.value after
 *      xterm's clearer so the scheduled finalize still sees the commit.
 *   3. As a backstop, if onData never carried the commit, injects it once.
 *
 * Position pinning stays in `./xterm-ime-anchor`; this only owns delivery.
 * Pure state helpers below are unit-tested without a DOM.
 */

import type { Terminal } from "@xterm/xterm";

export type ImeCommitGuardState = {
  composing: boolean;
  expectingFinalize: boolean;
  pendingCommit: string;
  sentSinceFinalize: boolean;
};

export function createImeCommitGuardState(): ImeCommitGuardState {
  return {
    composing: false,
    expectingFinalize: false,
    pendingCommit: "",
    sentSinceFinalize: false,
  };
}

function remember(state: ImeCommitGuardState, text: string): void {
  if (text) state.pendingCommit = text;
}

export function noteCompositionStart(state: ImeCommitGuardState): void {
  state.composing = true;
  state.pendingCommit = "";
  state.sentSinceFinalize = false;
}

export function noteCompositionUpdate(state: ImeCommitGuardState, data: string): void {
  remember(state, data);
}

export function noteCompositionEnd(
  state: ImeCommitGuardState,
  textareaValue: string,
  data: string,
): void {
  state.composing = false;
  remember(state, textareaValue || data || state.pendingCommit);
  state.expectingFinalize = true;
  state.sentSinceFinalize = false;
}

/** Capture-phase blur: snapshot before xterm clears the textarea. */
export function noteBlurCapture(state: ImeCommitGuardState, textareaValue: string): void {
  if (!(state.composing || state.expectingFinalize)) return;
  remember(state, textareaValue || state.pendingCommit);
  // A blur without compositionend is an OS cancel — drop the composing flag so
  // a later blur does not keep treating stale textarea text as a commit.
  if (!state.expectingFinalize) {
    state.composing = false;
    state.pendingCommit = "";
  }
}

/**
 * Bubble-phase blur: value to write back after xterm's clearer, or null when
 * there is nothing to restore.
 */
export function restoreValueAfterBlur(state: ImeCommitGuardState): string | null {
  if (!state.expectingFinalize || !state.pendingCommit) return null;
  return state.pendingCommit;
}

/** Watch xterm onData during the finalize window so we do not double-inject. */
export function noteCommitDelivered(state: ImeCommitGuardState, data: string): void {
  if (!state.expectingFinalize || !state.pendingCommit) return;
  if (data.includes(state.pendingCommit) || state.pendingCommit.includes(data)) {
    state.sentSinceFinalize = true;
  }
}

/**
 * After the finalize delay: text to inject once if xterm dropped it, else null.
 * Clears the finalize window either way.
 */
export function takeFinalizeRescue(state: ImeCommitGuardState): string | null {
  const commit = state.pendingCommit;
  const alreadySent = state.sentSinceFinalize;
  state.expectingFinalize = false;
  state.pendingCommit = "";
  state.sentSinceFinalize = false;
  if (!commit || alreadySent) return null;
  return commit;
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
    noteCompositionStart(state);
  };

  const onCompositionUpdate = (ev: Event) => {
    if (!fromTextarea(ev)) return;
    noteCompositionUpdate(state, (ev as CompositionEvent).data ?? "");
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
  root.addEventListener("compositionupdate", onCompositionUpdate, true);
  textarea.addEventListener("compositionend", onCompositionEnd);
  textarea.addEventListener("blur", onBlurCapture, true);
  textarea.addEventListener("blur", onBlurBubble, false);

  return () => {
    window.clearTimeout(finalizeTimer);
    dataDisposable.dispose();
    root.removeEventListener("compositionstart", onCompositionStart, true);
    root.removeEventListener("compositionupdate", onCompositionUpdate, true);
    textarea.removeEventListener("compositionend", onCompositionEnd);
    textarea.removeEventListener("blur", onBlurCapture, true);
    textarea.removeEventListener("blur", onBlurBubble, false);
  };
}

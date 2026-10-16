/**
 * Copy-on-select scheduling, kept free of DOM / xterm imports so it can be unit
 * tested with injected timers.
 *
 * Find-in-terminal moves xterm's selection onto each match (SearchAddon selects
 * the hit). Those selection changes must never reach the clipboard, so search
 * code wraps them in {@link withProgrammaticSelection}; the auto-copy listener
 * then treats the selection as search-owned until the user starts a new
 * selection gesture (mouse down / select-all).
 */

/** Per-terminal nesting depth of in-flight programmatic selection changes. */
const programmaticDepth = new WeakMap<object, number>();

/**
 * Run `fn` with selection changes on `term` marked as programmatic (not user
 * intent). xterm fires `onSelectionChange` synchronously from `select()`,
 * `clearSelection()` and SearchAddon `findNext/findPrevious`, so the scope is
 * exactly the duration of the call.
 */
export function withProgrammaticSelection<T>(term: object, fn: () => T): T {
  programmaticDepth.set(term, (programmaticDepth.get(term) ?? 0) + 1);
  try {
    return fn();
  } finally {
    const depth = (programmaticDepth.get(term) ?? 1) - 1;
    if (depth > 0) programmaticDepth.set(term, depth);
    else programmaticDepth.delete(term);
  }
}

/** True while a {@link withProgrammaticSelection} call is running for `term`. */
export function isProgrammaticSelection(term: object): boolean {
  return (programmaticDepth.get(term) ?? 0) > 0;
}

export interface SelectionAutoCopyDeps<H> {
  delayMs: number;
  setTimer: (fn: () => void, ms: number) => H;
  clearTimer: (handle: H) => void;
  /** Write `text` to the clipboard. */
  copy: (text: string) => void;
  /** Skip scheduling (e.g. the same text was auto-copied a moment ago). */
  shouldSkip?: (text: string) => boolean;
  /** A copy was queued; publish it so a paste elsewhere can flush it early. */
  onQueued?: (text: string) => void;
  /** A queued copy was dropped because search took over the selection. */
  onDropped?: (text: string) => void;
}

export interface SelectionAutoCopy {
  /** Feed every xterm `onSelectionChange` (with the current selection text). */
  selectionChanged(text: string, programmatic: boolean): void;
  /** The user started a selection of their own (mouse down, select-all). */
  userGesture(): void;
  /** Write the queued copy now (mouse released) instead of after the debounce. */
  flush(): void;
  /** Drop any queued copy. */
  cancel(): void;
}

export function createSelectionAutoCopy<H>(
  deps: SelectionAutoCopyDeps<H>,
): SelectionAutoCopy {
  let timer: H | null = null;
  let pendingText = "";
  /** Last selection was placed by search; ignore changes until a user gesture. */
  let searchOwned = false;

  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    pendingText = "";
  };

  const fire = () => {
    const text = pendingText;
    clear();
    if (!text) return;
    if (searchOwned) {
      // Search replaced the user's selection before the debounce elapsed.
      deps.onDropped?.(text);
      return;
    }
    deps.copy(text);
  };

  return {
    selectionChanged(text, programmatic) {
      if (programmatic) {
        searchOwned = true;
        return;
      }
      // Search-placed selection lingering (or xterm re-firing for it) is not
      // something the user selected.
      if (searchOwned) return;
      // Selection cleared (e.g. focus moved to another pane). Leave any pending
      // copy of the previous user selection alone — cancelling it here is what
      // made a quick copy-then-switch lose the text before it reached the
      // clipboard.
      if (!text || deps.shouldSkip?.(text)) return;
      deps.onQueued?.(text);
      if (timer !== null) deps.clearTimer(timer);
      pendingText = text;
      timer = deps.setTimer(fire, deps.delayMs);
    },
    userGesture() {
      searchOwned = false;
    },
    flush() {
      if (timer === null || !pendingText) return;
      fire();
    },
    cancel: clear,
  };
}

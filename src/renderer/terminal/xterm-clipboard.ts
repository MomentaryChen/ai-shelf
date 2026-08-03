import type { Terminal } from "@xterm/xterm";
import { shouldDeferImeKeyToXterm, shouldIgnoreShortcutForIme } from "./ime-keys";
import { tryConsumePaneShortcut } from "./pane-shortcuts";
import { getStoredT } from "../i18n/stored-locale.js";

/** Serialize clipboard IPC so copy-then-paste across panes does not read mid-write (Windows). */
let clipboardOp: Promise<void> = Promise.resolve();

function runClipboardOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = clipboardOp.then(fn, fn);
  clipboardOp = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function normalizeClipboardText(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

function clipboardTextsMatch(a: string, b: string): boolean {
  return normalizeClipboardText(a) === normalizeClipboardText(b);
}

/**
 * Selection text scheduled for copy-on-select but not yet passed to writeClipboardText.
 * Module-scoped so a paste in another pane can flush it before reading the OS clipboard.
 */
let pendingSelectionCopy: { text: string; at: number } | null = null;

/** Last write completed through our queue; paste prefers this briefly after copy. */
let lastOurWrite = { text: "", at: 0, seq: 0, osConfirmed: false };
let writeSeq = 0;

/** After copy, paste within this window can skip a stale OS / navigator read. */
const PASTE_AFTER_WRITE_MS = 1000;
/** How long a debounced copy-on-select may still be flushed by paste. */
const PENDING_COPY_MAX_MS = 2000;

function notePendingSelectionCopy(text: string): void {
  pendingSelectionCopy = { text, at: Date.now() };
}

function clearPendingSelectionCopy(text?: string): void {
  if (!pendingSelectionCopy) return;
  if (text === undefined || pendingSelectionCopy.text === text) {
    pendingSelectionCopy = null;
  }
}

function runOsClipboardRead(): Promise<string> {
  return (async () => {
    try {
      const text = await window.api.clipboardReadText();
      if (text) return text;
    } catch {
      /* fall through */
    }
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  })();
}

async function readClipboardText(): Promise<string> {
  // Copy-on-select debounces 50ms before queueing a write. Paste in that gap
  // used to read the previous OS clipboard and look like "copy did nothing".
  const pending = pendingSelectionCopy;
  if (pending?.text && Date.now() - pending.at < PENDING_COPY_MAX_MS) {
    await writeClipboardText(pending.text);
  }

  return runClipboardOp(async () => {
    const age = Date.now() - lastOurWrite.at;
    if (lastOurWrite.text && age < PASTE_AFTER_WRITE_MS) {
      // Unconfirmed writes (navigator fallback / locked clipboard): always prefer
      // our text for the whole window — not just the first paste.
      if (!lastOurWrite.osConfirmed) return lastOurWrite.text;

      const osText = await runOsClipboardRead();
      // OS matched at write time; if it still matches or is empty, use our text.
      // If it differs, the user copied elsewhere after us — prefer OS.
      if (!osText || clipboardTextsMatch(osText, lastOurWrite.text)) {
        return lastOurWrite.text;
      }
      return osText;
    }
    return (await runOsClipboardRead()) || "";
  });
}

export async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;
  const seq = ++writeSeq;
  return runClipboardOp(async () => {
    // Main process verifies the write and reports false when the OS clipboard
    // stayed locked; treat that the same as an IPC error and try navigator.
    let osConfirmed = false;
    try {
      osConfirmed = (await window.api.clipboardWriteText(text)) !== false;
    } catch {
      osConfirmed = false;
    }
    if (!osConfirmed) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        clearPendingSelectionCopy();
        return false;
      }
      // Don't trust navigator alone — confirm via main-process read when possible.
      try {
        const readBack = await window.api.clipboardReadText();
        osConfirmed = clipboardTextsMatch(readBack, text);
      } catch {
        osConfirmed = false;
      }
      // Navigator wrote something we couldn't verify; still expose it to paste
      // via lastOurWrite, but keep preferring it until the paste window ends.
      lastOurWrite = { text, at: Date.now(), seq, osConfirmed };
      clearPendingSelectionCopy();
      return true;
    }
    lastOurWrite = { text, at: Date.now(), seq, osConfirmed: true };
    clearPendingSelectionCopy();
    return true;
  });
}

const GUARD_MS = 80;

interface TerminalClipboardGuards {
  pasteUntil: number;
}

function createGuards(): TerminalClipboardGuards {
  return { pasteUntil: 0 };
}

export interface TerminalClipboardOptions {
  onOpenFind?: () => void;
  onClear?: () => void;
  onRestart?: () => void;
  onExportOutput?: () => void;
  onCopyOutputForIssue?: () => void;
  /** When true (default), right-click copies selection or pastes; Shift+right-click opens menu. */
  getRightClickPaste?: () => boolean;
  /** When true, finishing a mouse selection copies it to the clipboard automatically. */
  getCopyOnSelect?: () => boolean;
  /**
   * Paste into this terminal. When omitted, uses term.paste (may fan out via onData broadcast).
   * Prefer term.paste via a single-pane bypass in EmbeddedTerminal.
   */
  onPaste?: (text: string, term: Terminal) => void;
}

/** Stop Electron Edit-menu accelerators from duplicating our handler. */
function consumeKey(ev: KeyboardEvent): void {
  ev.preventDefault();
  ev.stopImmediatePropagation();
}

function isKeyDown(ev: KeyboardEvent): boolean {
  return ev.type === "keydown";
}

function hasMod(ev: KeyboardEvent): boolean {
  return ev.ctrlKey || ev.metaKey;
}

function isMacPlatform(): boolean {
  return /mac/i.test(navigator.platform || navigator.userAgent || "");
}

function isWindowsPlatform(): boolean {
  return /win/i.test(navigator.platform || navigator.userAgent || "");
}

/** xterm's selectAll() only covers the viewport; select the full scrollback buffer. */
function selectAllTerminalBuffer(term: Terminal): void {
  const lastLine = Math.max(0, term.buffer.active.length - 1);
  term.selectLines(0, lastLine);
}

/**
 * Windows: Ctrl+A (user expectation). Mac: Cmd+A. Linux: Ctrl+Shift+A (Ctrl+A = shell line-start).
 */
function isTerminalSelectAllShortcut(ev: KeyboardEvent): boolean {
  if (ev.key.toLowerCase() !== "a" || ev.altKey || !hasMod(ev)) return false;

  if (isMacPlatform()) {
    return ev.metaKey && !ev.ctrlKey && !ev.shiftKey;
  }
  if (isWindowsPlatform()) {
    return ev.ctrlKey && !ev.metaKey;
  }
  return ev.ctrlKey && !ev.metaKey && ev.shiftKey;
}

/**
 * Bind copy/paste/select-all shortcuts and a minimal context menu.
 * Returns a dispose function.
 */
export function bindTerminalClipboard(
  term: Terminal,
  container: HTMLElement,
  options: TerminalClipboardOptions = {},
): () => void {
  const guards = createGuards();
  // Swallow OSC 52 synchronously. Apps like Claude Code emit clipboard-set sequences
  // while rendering; letting them through would overwrite user clipboard. User copy/paste
  // uses our shortcuts instead. Async OSC handlers race with xterm 6.1 write/resize.
  const osc52Disposable = term.parser.registerOscHandler(52, () => true);

  const deliverPaste = (text: string) => {
    if (options.onPaste) options.onPaste(text, term);
    else term.paste(text);
    term.focus();
  };

  let lastExplicitCopy = { text: "", at: 0 };
  // Dedupe window for copy-on-select. Must expire: re-selecting the same text
  // after copying elsewhere has to write again, or the paste is stale.
  const AUTO_COPY_DEDUPE_MS = 500;
  const POINTER_PASTE_DEDUPE_MS = 100;
  let lastPointerPasteAt = 0;
  let lastAutoCopied = { text: "", at: 0 };
  let selCopyTimer = 0;
  let selCopyGeneration = 0;
  let pendingCopyText = "";

  const isRecentAutoCopy = (text: string) =>
    text === lastAutoCopied.text &&
    Date.now() - lastAutoCopied.at < AUTO_COPY_DEDUPE_MS;

  const runAutoCopy = (text: string) => {
    selCopyTimer = 0;
    pendingCopyText = "";
    if (!(options.getCopyOnSelect?.() ?? false)) return;
    if (isRecentAutoCopy(text)) {
      clearPendingSelectionCopy(text);
      return;
    }
    void writeClipboardText(text).then((ok) => {
      if (ok) lastAutoCopied = { text, at: Date.now() };
    });
  };

  const cancelPendingAutoCopy = (clearPending = false) => {
    pendingCopyText = "";
    selCopyGeneration += 1;
    window.clearTimeout(selCopyTimer);
    selCopyTimer = 0;
    if (clearPending) clearPendingSelectionCopy();
  };

  const copyTerminalSelection = async (): Promise<boolean> => {
    const text = term.getSelection();
    if (!text) return false;
    const now = Date.now();
    if (text === lastExplicitCopy.text && now - lastExplicitCopy.at < GUARD_MS) {
      return true;
    }
    // Set before the async write so a double-fired shortcut dedupes; cleared
    // below on failure so the guard cannot mask a failed write as copied.
    lastExplicitCopy = { text, at: now };
    cancelPendingAutoCopy();
    // Keep paste-flush aware of this text while the async write is in flight.
    notePendingSelectionCopy(text);
    const ok = await writeClipboardText(text);
    if (ok) {
      lastAutoCopied = { text, at: Date.now() };
    } else {
      lastExplicitCopy = { text: "", at: 0 };
    }
    return ok;
  };

  const pasteIntoTerminal = async (): Promise<boolean> => {
    const now = Date.now();
    if (now < guards.pasteUntil) return false;
    const text = await readClipboardText();
    if (!text) return false;
    guards.pasteUntil = now + GUARD_MS;
    deliverPaste(text);
    return true;
  };

  const onKey = (ev: KeyboardEvent): boolean => {
    if (!isKeyDown(ev)) return true;
    // Active IME composition: refuse so xterm skips its keydown→PTY path.
    // Space/Enter commit must stay with the IME (AI CLI prompts especially).
    if (shouldDeferImeKeyToXterm(ev)) return false;
    // keyCode 229 ("Process") before isComposing is set — let CompositionHelper
    // run, but never treat these as copy/paste/pane shortcuts.
    if (shouldIgnoreShortcutForIme(ev)) return true;
    if (tryConsumePaneShortcut(ev)) return false;

    const key = ev.key.toLowerCase();

    // Find in terminal: Ctrl+F
    if (hasMod(ev) && !ev.shiftKey && key === "f") {
      consumeKey(ev);
      options?.onOpenFind?.();
      return false;
    }

    // Paste: Ctrl+V, Ctrl+Shift+V, Shift+Insert
    if (
      (hasMod(ev) && key === "v") ||
      (ev.shiftKey && !hasMod(ev) && key === "insert")
    ) {
      consumeKey(ev);
      void pasteIntoTerminal();
      return false;
    }

    // Copy: Ctrl+Shift+C, Ctrl+Insert
    if (hasMod(ev) && ev.shiftKey && key === "c") {
      consumeKey(ev);
      void copyTerminalSelection();
      return false;
    }
    if (hasMod(ev) && key === "insert" && !ev.shiftKey) {
      consumeKey(ev);
      void copyTerminalSelection();
      return false;
    }

    // Ctrl+C — copy when text selected, otherwise send interrupt to shell
    if (hasMod(ev) && !ev.shiftKey && key === "c") {
      if (term.hasSelection()) {
        consumeKey(ev);
        void copyTerminalSelection();
        return false;
      }
      return true;
    }

    // Select all: Ctrl+A (Windows), Cmd+A (Mac), Ctrl+Shift+A (Linux)
    if (isTerminalSelectAllShortcut(ev)) {
      consumeKey(ev);
      selectAllTerminalBuffer(term);
      return false;
    }

    // Clear screen: Ctrl+L (also handled globally via pane-shortcuts when focused)
    if (hasMod(ev) && !ev.shiftKey && key === "l") {
      consumeKey(ev);
      options.onClear?.();
      return false;
    }

    // Restart session: Ctrl+Shift+R
    if (hasMod(ev) && ev.shiftKey && key === "r") {
      consumeKey(ev);
      options.onRestart?.();
      return false;
    }

    return true;
  };

  term.attachCustomKeyEventHandler(onKey);

  let menuEl: HTMLDivElement | null = null;

  const removeMenu = () => {
    menuEl?.remove();
    menuEl = null;
    document.removeEventListener("click", removeMenu);
    document.removeEventListener("contextmenu", removeMenu);
  };

  const showContextMenu = (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    removeMenu();

    const hasSelection = term.hasSelection();
    menuEl = document.createElement("div");
    menuEl.className =
      "fixed z-[100] min-w-[140px] overflow-hidden rounded-md border border-chrome-border-strong bg-chrome-surface-hover py-1 shadow-xl";
    menuEl.style.left = `${ev.clientX}px`;
    menuEl.style.top = `${ev.clientY}px`;

    const addItem = (label: string, enabled: boolean, action: () => void) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.disabled = !enabled;
      btn.className =
        "block w-full cursor-pointer px-3 py-1.5 text-left text-[12px] text-chrome-text hover:bg-chrome-surface-hover disabled:cursor-default disabled:text-chrome-text-dim";
      if (enabled) btn.addEventListener("click", () => {
        removeMenu();
        action();
        term.focus();
      });
      menuEl!.appendChild(btn);
    };

    addItem(getStoredT("terminal.ctx.copy"), hasSelection, () => void copyTerminalSelection());
    addItem(getStoredT("terminal.ctx.paste"), true, () => void pasteIntoTerminal());
    addItem(getStoredT("terminal.ctx.find"), true, () => options?.onOpenFind?.());
    addItem(getStoredT("terminal.ctx.selectAll"), true, () => selectAllTerminalBuffer(term));
    if (options.onExportOutput) {
      addItem(getStoredT("terminal.ctx.exportOutput"), true, options.onExportOutput);
    }
    if (options.onCopyOutputForIssue) {
      addItem(getStoredT("terminal.ctx.copyOutputForIssue"), true, options.onCopyOutputForIssue);
    }
    if (options.onClear) addItem(getStoredT("terminal.ctx.clear"), true, options.onClear);
    if (options.onRestart) addItem(getStoredT("terminal.ctx.restart"), true, options.onRestart);

    document.body.appendChild(menuEl);
    requestAnimationFrame(() => {
      document.addEventListener("click", removeMenu);
      document.addEventListener("contextmenu", removeMenu);
    });
  };

  /**
   * Run before xterm's internal contextmenu handler (capture phase).
   * xterm otherwise moves/focuses its hidden textarea and breaks our paste path.
   */
  const onPointerPaste = (ev: MouseEvent) => {
    const rightClickPaste = options.getRightClickPaste?.() ?? true;
    if (!rightClickPaste || ev.shiftKey) return;

    // Right-click can fire both mousedown (Firefox path) and contextmenu for
    // the same physical click; dedupe so paste doesn't double-fire.
    const now = Date.now();
    if (now - lastPointerPasteAt < POINTER_PASTE_DEDUPE_MS) return;
    lastPointerPasteAt = now;

    ev.preventDefault();
    ev.stopImmediatePropagation();
    removeMenu();

    if (term.hasSelection()) {
      void (async () => {
        const copied = await copyTerminalSelection();
        if (copied) term.clearSelection();
      })();
      return;
    }

    term.clearSelection();
    void pasteIntoTerminal();
  };

  const onContextMenu = (ev: MouseEvent) => {
    const rightClickPaste = options.getRightClickPaste?.() ?? true;
    if (rightClickPaste && !ev.shiftKey) {
      onPointerPaste(ev);
      return;
    }
    ev.preventDefault();
    ev.stopImmediatePropagation();
    showContextMenu(ev);
  };

  container.addEventListener("contextmenu", onContextMenu, { capture: true });

  /**
   * Copy-on-select via xterm's own selection event (more reliable than a DOM
   * mouseup, whose listener xterm's document-level drag handling can bypass).
   * Debounced so a drag copies once when it settles, and written directly so the
   * per-pane copy guard can't drop the final selection mid-drag.
   */
  const onSelectionChange = () => {
    if (!(options.getCopyOnSelect?.() ?? false)) {
      cancelPendingAutoCopy(true);
      return;
    }
    const text = term.getSelection();
    // Selection cleared (e.g. focus moved to another pane). Leave any pending
    // copy of the previous selection alone — cancelling it here is what made a
    // quick copy-then-switch lose the text before it reached the clipboard.
    if (!text || isRecentAutoCopy(text)) return;
    // Publish immediately so a paste in another pane can flush before the
    // debounce timer queues the OS write.
    notePendingSelectionCopy(text);
    // Capture `text` now and write that exact value; re-reading on the timer
    // could see an already-cleared selection after the pane lost focus. Also
    // tracked in `pendingCopyText` so mouseup can flush it immediately below.
    const gen = ++selCopyGeneration;
    pendingCopyText = text;
    window.clearTimeout(selCopyTimer);
    selCopyTimer = window.setTimeout(() => {
      if (gen !== selCopyGeneration) return;
      runAutoCopy(text);
    }, 50);
  };
  const selectionDisposable = term.onSelectionChange(onSelectionChange);

  const isFirefox = /firefox/i.test(navigator.userAgent);

  const onMouseDown = (ev: MouseEvent) => {
    if (ev.button === 0) {
      term.focus();
      return;
    }
    // Firefox: contextmenu alone is unreliable; other platforms use contextmenu only
    // (calling paste on mousedown + contextmenu would paste twice).
    if (isFirefox && ev.button === 2) onPointerPaste(ev);
  };

  /**
   * A selection that just settled (mouse released) should be on the clipboard
   * immediately rather than after the 50ms debounce — otherwise a fast
   * select-then-paste into another pane can read a stale clipboard value.
   */
  const onMouseUp = (ev: MouseEvent) => {
    if (ev.button !== 0 || !selCopyTimer || !pendingCopyText) return;
    const text = pendingCopyText;
    const gen = selCopyGeneration;
    window.clearTimeout(selCopyTimer);
    selCopyTimer = 0;
    if (gen !== selCopyGeneration) return;
    runAutoCopy(text);
  };

  container.addEventListener("mousedown", onMouseDown, { capture: true });
  container.addEventListener("mouseup", onMouseUp, { capture: true });

  return () => {
    removeMenu();
    cancelPendingAutoCopy();
    selectionDisposable.dispose();
    container.removeEventListener("contextmenu", onContextMenu, { capture: true });
    container.removeEventListener("mousedown", onMouseDown, { capture: true });
    container.removeEventListener("mouseup", onMouseUp, { capture: true });
    term.attachCustomKeyEventHandler(() => true);
    osc52Disposable.dispose();
  };
}

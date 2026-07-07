import type { Terminal } from "@xterm/xterm";
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

/** Last write completed through our queue; paste prefers this briefly after copy. */
let lastOurWrite = { text: "", at: 0, seq: 0 };
let lastPasteSeq = 0;
let writeSeq = 0;

/** After copy, paste within this window skips a stale OS / navigator read. */
const PASTE_AFTER_WRITE_MS = 200;

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
  return runClipboardOp(async () => {
    const age = Date.now() - lastOurWrite.at;
    if (
      lastOurWrite.text &&
      lastOurWrite.seq > lastPasteSeq &&
      age < PASTE_AFTER_WRITE_MS
    ) {
      lastPasteSeq = lastOurWrite.seq;
      return lastOurWrite.text;
    }
    const text = await runOsClipboardRead();
    if (text) return text;
    if (lastOurWrite.text && age < PASTE_AFTER_WRITE_MS) return lastOurWrite.text;
    return "";
  });
}

export async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;
  const seq = ++writeSeq;
  return runClipboardOp(async () => {
    // Main process verifies the write and reports false when the OS clipboard
    // stayed locked; treat that the same as an IPC error and try navigator.
    let ok = false;
    try {
      ok = (await window.api.clipboardWriteText(text)) !== false;
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        return false;
      }
    }
    lastOurWrite = { text, at: Date.now(), seq };
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
  let lastAutoCopied = { text: "", at: 0 };
  let selCopyTimer = 0;
  let selCopyGeneration = 0;

  const isRecentAutoCopy = (text: string) =>
    text === lastAutoCopied.text &&
    Date.now() - lastAutoCopied.at < AUTO_COPY_DEDUPE_MS;

  const cancelPendingAutoCopy = () => {
    selCopyGeneration += 1;
    window.clearTimeout(selCopyTimer);
    selCopyTimer = 0;
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
      cancelPendingAutoCopy();
      return;
    }
    const text = term.getSelection();
    // Selection cleared (e.g. focus moved to another pane). Leave any pending
    // copy of the previous selection alone — cancelling it here is what made a
    // quick copy-then-switch lose the text before it reached the clipboard.
    if (!text || isRecentAutoCopy(text)) return;
    // Capture `text` now and write that exact value; re-reading on the timer
    // could see an already-cleared selection after the pane lost focus.
    const gen = ++selCopyGeneration;
    window.clearTimeout(selCopyTimer);
    selCopyTimer = window.setTimeout(() => {
      if (gen !== selCopyGeneration) return;
      if (!(options.getCopyOnSelect?.() ?? false)) return;
      void writeClipboardText(text).then((ok) => {
        // Record only successful writes so a locked clipboard gets retried
        // by the next selection event instead of being deduped away.
        if (ok) lastAutoCopied = { text, at: Date.now() };
      });
    }, 50);
  };
  const selectionDisposable = term.onSelectionChange(onSelectionChange);

  const onMouseDown = (ev: MouseEvent) => {
    if (ev.button === 2) onPointerPaste(ev);
  };
  const isFirefox = /firefox/i.test(navigator.userAgent);
  if (isFirefox) {
    container.addEventListener("mousedown", onMouseDown, { capture: true });
  }

  return () => {
    removeMenu();
    window.clearTimeout(selCopyTimer);
    selectionDisposable.dispose();
    container.removeEventListener("contextmenu", onContextMenu, { capture: true });
    if (isFirefox) {
      container.removeEventListener("mousedown", onMouseDown, { capture: true });
    }
    term.attachCustomKeyEventHandler(() => true);
    osc52Disposable.dispose();
  };
}

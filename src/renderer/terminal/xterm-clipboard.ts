import type { Terminal } from "@xterm/xterm";
import {
  ClipboardAddon,
  type ClipboardSelectionType,
  type IClipboardProvider,
} from "@xterm/addon-clipboard";
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

async function readClipboardText(): Promise<string> {
  return runClipboardOp(async () => {
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
  });
}

async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;
  return runClipboardOp(async () => {
    try {
      await window.api.clipboardWriteText(text);
      return true;
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
  });
}

/** Electron clipboard via preload — more reliable than navigator.clipboard in xterm OSC handler. */
class ElectronClipboardProvider implements IClipboardProvider {
  readText(_selection: ClipboardSelectionType): Promise<string> {
    return readClipboardText();
  }

  writeText(_selection: ClipboardSelectionType, data: string): Promise<void> {
    return writeClipboardText(data).then(() => undefined);
  }
}

const GUARD_MS = 80;

interface TerminalClipboardGuards {
  copyUntil: number;
  pasteUntil: number;
}

function createGuards(): TerminalClipboardGuards {
  return { copyUntil: 0, pasteUntil: 0 };
}

export interface TerminalClipboardOptions {
  onOpenFind?: () => void;
  onClear?: () => void;
  onRestart?: () => void;
  /** When true (default), right-click copies selection or pastes; Shift+right-click opens menu. */
  getRightClickPaste?: () => boolean;
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
  const clipboardAddon = new ClipboardAddon(new ElectronClipboardProvider());
  term.loadAddon(clipboardAddon);

  const deliverPaste = (text: string) => {
    if (options.onPaste) options.onPaste(text, term);
    else term.paste(text);
    term.focus();
  };

  const copyTerminalSelection = async (): Promise<boolean> => {
    const now = Date.now();
    if (now < guards.copyUntil) return false;
    const text = term.getSelection();
    if (!text) return false;
    guards.copyUntil = now + GUARD_MS;
    return writeClipboardText(text);
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

    // Select all: Ctrl+Shift+A (Ctrl+A is line-start in most shells)
    if (hasMod(ev) && ev.shiftKey && key === "a") {
      consumeKey(ev);
      term.selectAll();
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
    addItem(getStoredT("terminal.ctx.selectAll"), true, () => term.selectAll());
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
      void copyTerminalSelection();
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

  const onMouseDown = (ev: MouseEvent) => {
    if (ev.button === 2) onPointerPaste(ev);
  };
  const isFirefox = /firefox/i.test(navigator.userAgent);
  if (isFirefox) {
    container.addEventListener("mousedown", onMouseDown, { capture: true });
  }

  return () => {
    removeMenu();
    container.removeEventListener("contextmenu", onContextMenu, { capture: true });
    if (isFirefox) {
      container.removeEventListener("mousedown", onMouseDown, { capture: true });
    }
    term.attachCustomKeyEventHandler(() => true);
    clipboardAddon.dispose();
  };
}

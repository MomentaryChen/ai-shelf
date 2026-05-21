import type { Terminal } from "@xterm/xterm";
import {
  ClipboardAddon,
  type ClipboardSelectionType,
  type IClipboardProvider,
} from "@xterm/addon-clipboard";
import { tryConsumePaneShortcut } from "./pane-shortcuts";

/** Electron clipboard via preload — more reliable than navigator.clipboard in xterm. */
class ElectronClipboardProvider implements IClipboardProvider {
  readText(_selection: ClipboardSelectionType): Promise<string> {
    return window.api.clipboardReadText();
  }

  writeText(_selection: ClipboardSelectionType, data: string): Promise<void> {
    return window.api.clipboardWriteText(data);
  }
}

async function readClipboardText(): Promise<string> {
  try {
    return await window.api.clipboardReadText();
  } catch {
    return "";
  }
}

async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;
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
}

let copyGuardUntil = 0;

export async function copyTerminalSelection(term: Terminal): Promise<boolean> {
  const now = Date.now();
  if (now < copyGuardUntil) return false;
  const text = term.getSelection();
  if (!text) return false;
  copyGuardUntil = now + 120;
  return writeClipboardText(text);
}

let pasteGuardUntil = 0;

export async function pasteIntoTerminal(term: Terminal): Promise<boolean> {
  const now = Date.now();
  if (now < pasteGuardUntil) return false;
  const text = await readClipboardText();
  if (!text) return false;
  pasteGuardUntil = now + 120;
  term.paste(text);
  term.focus();
  return true;
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

export interface TerminalClipboardOptions {
  onOpenFind?: () => void;
  onClear?: () => void;
  onRestart?: () => void;
  /** When true (default), right-click copies selection or pastes; Shift+right-click opens menu. */
  getRightClickPaste?: () => boolean;
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
  const clipboardAddon = new ClipboardAddon(new ElectronClipboardProvider());
  term.loadAddon(clipboardAddon);

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
      void pasteIntoTerminal(term);
      return false;
    }

    // Copy: Ctrl+Shift+C, Ctrl+Insert
    if (hasMod(ev) && ev.shiftKey && key === "c") {
      consumeKey(ev);
      void copyTerminalSelection(term);
      return false;
    }
    if (hasMod(ev) && key === "insert" && !ev.shiftKey) {
      consumeKey(ev);
      void copyTerminalSelection(term);
      return false;
    }

    // Ctrl+C — copy when text selected, otherwise send interrupt to shell
    if (hasMod(ev) && !ev.shiftKey && key === "c") {
      if (term.hasSelection()) {
        consumeKey(ev);
        void copyTerminalSelection(term);
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
      "fixed z-[100] min-w-[140px] overflow-hidden rounded-md border border-[#333] bg-[#1a1a1a] py-1 shadow-xl";
    menuEl.style.left = `${ev.clientX}px`;
    menuEl.style.top = `${ev.clientY}px`;

    const addItem = (label: string, enabled: boolean, action: () => void) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.disabled = !enabled;
      btn.className =
        "block w-full cursor-pointer px-3 py-1.5 text-left text-[12px] text-[#e0e0e0] hover:bg-[#2a2a2a] disabled:cursor-default disabled:text-[#555]";
      if (enabled) btn.addEventListener("click", () => {
        removeMenu();
        action();
        term.focus();
      });
      menuEl!.appendChild(btn);
    };

    addItem("Copy", hasSelection, () => void copyTerminalSelection(term));
    addItem("Paste", true, () => void pasteIntoTerminal(term));
    addItem("Find…", true, () => options?.onOpenFind?.());
    addItem("Select all", true, () => term.selectAll());
    if (options.onClear) addItem("清屏", true, options.onClear);
    if (options.onRestart) addItem("重啟 session", true, options.onRestart);

    document.body.appendChild(menuEl);
    requestAnimationFrame(() => {
      document.addEventListener("click", removeMenu);
      document.addEventListener("contextmenu", removeMenu);
    });
  };

  const onContextMenu = (ev: MouseEvent) => {
    const rightClickPaste = options.getRightClickPaste?.() ?? true;
    if (rightClickPaste && !ev.shiftKey) {
      ev.preventDefault();
      ev.stopPropagation();
      removeMenu();
      if (term.hasSelection()) void copyTerminalSelection(term);
      else void pasteIntoTerminal(term);
      return;
    }
    showContextMenu(ev);
  };

  container.addEventListener("contextmenu", onContextMenu);

  return () => {
    removeMenu();
    container.removeEventListener("contextmenu", onContextMenu);
    term.attachCustomKeyEventHandler(() => true);
    clipboardAddon.dispose();
  };
}

import type { Terminal } from "@xterm/xterm";

/**
 * Dispose a terminal instance. Clears any in-flight text selection first so
 * xterm tears down document-level mouse-drag listeners before the renderer is
 * destroyed (xterm.js #5586).
 */
export function disposeTerminal(term: Terminal): void {
  try {
    term.clearSelection();
  } catch {
    /* terminal may already be partially torn down */
  }
  term.dispose();
}

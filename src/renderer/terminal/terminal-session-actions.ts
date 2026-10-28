/** Per-session hooks registered by EmbeddedTerminal (xterm + PTY). */

type ClearFn = () => void;

const clearBySession = new Map<string, ClearFn>();

export function registerTerminalClear(sessionId: string, fn: ClearFn): () => void {
  clearBySession.set(sessionId, fn);
  return () => {
    if (clearBySession.get(sessionId) === fn) clearBySession.delete(sessionId);
  };
}

export function clearTerminalSession(sessionId: string): void {
  const fn = clearBySession.get(sessionId);
  if (fn) {
    fn();
    return;
  }
  void window.api.ptyWrite(sessionId, "\x0c");
}

/** A mounted pane's own paste path (xterm `term.paste`, its bracketed mode, its PTY only). */
export interface TerminalPasteTarget {
  paste: (text: string) => void;
  isBracketedPaste: () => boolean;
}

const pasteBySession = new Map<string, TerminalPasteTarget>();

export function registerTerminalPasteTarget(
  sessionId: string,
  target: TerminalPasteTarget,
): () => void {
  pasteBySession.set(sessionId, target);
  return () => {
    if (pasteBySession.get(sessionId) === target) pasteBySession.delete(sessionId);
  };
}

export function getTerminalPasteTarget(sessionId: string): TerminalPasteTarget | undefined {
  return pasteBySession.get(sessionId);
}

/**
 * Paste into one session through its own terminal so each pane applies its own
 * bracketed paste mode (a broadcast fan-out of one pane's bracketed bytes would
 * leak `ESC[200~` into panes that never enabled it). Unmounted panes get the
 * text unbracketed with newlines as CR, like xterm does.
 */
export function pasteToTerminalSession(sessionId: string, text: string): void {
  const target = pasteBySession.get(sessionId);
  if (target) {
    target.paste(text);
    return;
  }
  void window.api.ptyWrite(sessionId, text.replace(/\r?\n/g, "\r"));
}

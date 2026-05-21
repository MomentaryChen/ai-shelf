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
  window.api.ptyWrite(sessionId, "\x0c");
}

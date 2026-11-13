import type { Terminal } from "@xterm/xterm";
import { parseOsc777, parseOsc9, type TerminalNotifyEvent } from "./terminal-notify";

/**
 * Forward BEL and OSC 9 / OSC 777 notification requests while `isLive()`
 * (never for the replayed backlog). Filtering / rate limiting happens in the
 * receiver. Returns a dispose function.
 */
export function bindTerminalNotifications(
  term: Terminal,
  isLive: () => boolean,
  onEvent: (event: TerminalNotifyEvent) => void,
): () => void {
  const emit = (event: TerminalNotifyEvent) => {
    if (!isLive()) return;
    try {
      onEvent(event);
    } catch (err) {
      console.warn("[terminal-notify]", err);
    }
  };

  const bell = term.onBell(() => emit({ kind: "bell" }));
  const osc9 = term.parser.registerOscHandler(9, (data) => {
    const n = parseOsc9(data);
    if (!n) return false;
    emit({ kind: "osc", ...n });
    return true;
  });
  const osc777 = term.parser.registerOscHandler(777, (data) => {
    const n = parseOsc777(data);
    if (!n) return false;
    emit({ kind: "osc", ...n });
    return true;
  });

  return () => {
    bell.dispose();
    osc9.dispose();
    osc777.dispose();
  };
}

/**
 * Track whether a shell command is executing from the raw PTY stream, using the
 * OSC 133 marks our shell integration emits (A prompt · B input · C output · D done).
 *
 * Pure and chunk-safe: a sequence split across chunks is carried to the next call.
 * `running` stays null until the first `C` — shells that never emit `C` (cmd,
 * bash < 4.4, an agent launched as the shell's startup command) stay "unknown".
 */

export interface Osc133StreamState {
  /** Incomplete escape sequence held back from the previous chunk. */
  carry: string;
  /** true between C and the next A/B/D; null until a C has ever been seen. */
  running: boolean | null;
}

export const INITIAL_OSC133_STREAM: Osc133StreamState = { carry: "", running: null };

// eslint-disable-next-line no-control-regex
const MARK_RE = /\x1b\]133;([ABCD])[^\x07\x1b]*(?:\x07|\x1b\\)/g;
const MARK_PREFIX = "\x1b]133;";
/** Longest incomplete OSC we bother carrying (`ESC ] 133 ; D ; <exit> ; …`). */
const MAX_CARRY = 128;

export function scanOsc133Running(prev: Osc133StreamState, chunk: string): Osc133StreamState {
  if (!prev.carry && !chunk.includes("\x1b")) return prev;
  const text = prev.carry + chunk;

  let running = prev.running;
  let end = 0;
  MARK_RE.lastIndex = 0;
  for (let m = MARK_RE.exec(text); m; m = MARK_RE.exec(text)) {
    end = m.index + m[0].length;
    const kind = m[1];
    if (kind === "C") running = true;
    else if (running !== null) running = false;
  }

  // Carry an unfinished `ESC ] 133 ;` sequence (its ST may be split as ESC | `\`),
  // or a trailing fragment that could still grow into one.
  let carry = "";
  const lastStart = text.lastIndexOf(MARK_PREFIX);
  if (lastStart >= end && text.length - lastStart <= MAX_CARRY) {
    const rest = text.slice(lastStart);
    if (!rest.includes("\x07")) carry = rest;
  } else {
    const lastEsc = text.lastIndexOf("\x1b");
    if (lastEsc >= end && text.length - lastEsc < MARK_PREFIX.length) {
      const rest = text.slice(lastEsc);
      if (MARK_PREFIX.startsWith(rest)) carry = rest;
    }
  }

  if (running === prev.running && carry === prev.carry) return prev;
  return { carry, running };
}

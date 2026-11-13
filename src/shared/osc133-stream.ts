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
const MARK_RE =/\x1b\]133;([ABCD])[^\x07\x1b]*(?:\x07|\x1b\\)/g;
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

  // Carry a trailing ESC that may begin an unfinished `ESC ] 133 ;` sequence.
  let carry = "";
  const lastEsc = text.lastIndexOf("\x1b");
  if (lastEsc >= end && text.length - lastEsc <= MAX_CARRY) {
    const rest = text.slice(lastEsc);
    const prefix = "\x1b]133;";
    const couldBeMark =
      rest.length <= prefix.length ? prefix.startsWith(rest) : rest.startsWith(prefix);
    if (couldBeMark && !rest.includes("\x07")) carry = rest;
  }

  if (running === prev.running && carry === prev.carry) return prev;
  return { carry, running };
}

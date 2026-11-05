/**
 * Coalesced PTY data broadcast state.
 *
 * `broadcastPtyData` appends into both the durable output buffer and a short
 * pending map flushed on a timer. When the renderer attaches with the full
 * buffer, that pending tail is already inside the buffer — flushing it again
 * double-paints the same chunk. `dropPtyDataPending` cancels that flush.
 *
 * Pending bytes stay in pieces. A burst (or the backlog ConPTY dumps after
 * sleep) must not be joined into one string and sent in one IPC message:
 * that stalls the main process and the terminal renderer together.
 *
 * Each slice carries `endSeq`, the total units appended after that slice.
 * The renderer uses it to drop a copy that the attach snapshot already has,
 * including when one burst is split across several IPC messages.
 */

import {
  appendPtyChunk,
  createPtyChunkBuffer,
  materializePtyChunk,
  takePtyChunkPrefix,
  type PtyChunkBuffer,
} from "./pty-chunk-buffer.js";

/** Largest pty-data payload sent in one turn. The rest is scheduled. */
export const PTY_DATA_IPC_MAX_CHARS = 32 * 1024;

export type PtyDataSlice = {
  data: string;
  /** Total string units appended for this session after `data`. */
  endSeq: number;
  rest: boolean;
};

export type PtyDataPendingState = {
  pending: Map<string, PtyChunkBuffer>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  /** Monotonic units appended per session. Not cleared when the pending tail is dropped. */
  seq: Map<string, number>;
};

export function createPtyDataPendingState(): PtyDataPendingState {
  return { pending: new Map(), timers: new Map(), seq: new Map() };
}

export function ptyDataEndSeq(state: PtyDataPendingState, sessionId: string): number {
  return state.seq.get(sessionId) ?? 0;
}

export function queuePtyDataPending(
  state: PtyDataPendingState,
  sessionId: string,
  data: string,
  coalesceMs: number,
  flush: (sessionId: string) => void,
): void {
  if (!data) return;
  const endSeq = (state.seq.get(sessionId) ?? 0) + data.length;
  state.seq.set(sessionId, endSeq);
  let buf = state.pending.get(sessionId);
  if (!buf) {
    buf = createPtyChunkBuffer();
    state.pending.set(sessionId, buf);
  }
  appendPtyChunk(buf, data, Number.POSITIVE_INFINITY);
  if (state.timers.has(sessionId)) return;
  const timer = setTimeout(() => {
    state.timers.delete(sessionId);
    flush(sessionId);
  }, coalesceMs);
  state.timers.set(sessionId, timer);
}

function clearPendingTimer(state: PtyDataPendingState, sessionId: string): void {
  const timer = state.timers.get(sessionId);
  if (!timer) return;
  clearTimeout(timer);
  state.timers.delete(sessionId);
}

/** Cancel the coalesce timer and discard pending without sending. */
export function dropPtyDataPending(state: PtyDataPendingState, sessionId: string): void {
  clearPendingTimer(state, sessionId);
  state.pending.delete(sessionId);
}

/**
 * Take at most `maxChars`. Any remainder stays pending and the timer is
 * cleared — the caller schedules the next slice so the event loop can run.
 * `endSeq` stops at this slice, not at bytes still waiting.
 */
export function takePtyDataPendingLimited(
  state: PtyDataPendingState,
  sessionId: string,
  maxChars: number,
): PtyDataSlice {
  clearPendingTimer(state, sessionId);
  const totalSeq = state.seq.get(sessionId) ?? 0;
  const buf = state.pending.get(sessionId);
  if (!buf || buf.length === 0) {
    state.pending.delete(sessionId);
    return { data: "", rest: false, endSeq: totalSeq };
  }
  const startSeq = totalSeq - buf.length;
  const limit = Math.max(1, maxChars);
  if (buf.length <= limit) {
    const data = materializePtyChunk(buf);
    state.pending.delete(sessionId);
    return { data, rest: false, endSeq: startSeq + data.length };
  }
  const data = takePtyChunkPrefix(buf, limit);
  if (!data || buf.length === 0) {
    state.pending.delete(sessionId);
    return { data, rest: false, endSeq: startSeq + data.length };
  }
  return { data, rest: true, endSeq: startSeq + data.length };
}

/** Cancel the timer and take every pending byte. */
export function takePtyDataPending(state: PtyDataPendingState, sessionId: string): string {
  return takePtyDataPendingLimited(state, sessionId, Number.POSITIVE_INFINITY).data;
}

/** Live pending text. Collapses pieces; safe to call from tests. */
export function peekPtyPending(state: PtyDataPendingState, sessionId: string): string {
  const buf = state.pending.get(sessionId);
  if (!buf) return "";
  return materializePtyChunk(buf);
}

/**
 * Send pending output in bounded slices. `schedule` must yield to the event
 * loop. `done` runs after the last slice (used to emit pty-exit in order).
 */
export function pumpPtyDataPending(
  state: PtyDataPendingState,
  sessionId: string,
  maxChars: number,
  send: (data: string, endSeq: number) => void,
  schedule: (run: () => void) => ReturnType<typeof setTimeout>,
  done: () => void,
): void {
  const { data, rest, endSeq } = takePtyDataPendingLimited(state, sessionId, maxChars);
  if (data) send(data, endSeq);
  if (!rest) {
    done();
    return;
  }
  const timer = schedule(() => {
    state.timers.delete(sessionId);
    pumpPtyDataPending(state, sessionId, maxChars, send, schedule, done);
  });
  state.timers.set(sessionId, timer);
}

/**
 * Attach with `includeBuffer: true` replays the durable buffer, which already
 * contains any coalesced pending tail — drop pending so it is not re-sent.
 */
export function shouldDropPendingOnBufferAttach(includeBuffer: boolean): boolean {
  return includeBuffer;
}

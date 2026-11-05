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

export type PtyDataPendingState = {
  pending: Map<string, PtyChunkBuffer>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
};

export function createPtyDataPendingState(): PtyDataPendingState {
  return { pending: new Map(), timers: new Map() };
}

export function queuePtyDataPending(
  state: PtyDataPendingState,
  sessionId: string,
  data: string,
  coalesceMs: number,
  flush: (sessionId: string) => void,
): void {
  if (!data) return;
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

/** Cancel the timer and take every pending byte. */
export function takePtyDataPending(state: PtyDataPendingState, sessionId: string): string {
  clearPendingTimer(state, sessionId);
  const buf = state.pending.get(sessionId);
  state.pending.delete(sessionId);
  if (!buf) return "";
  return materializePtyChunk(buf);
}

/**
 * Take at most `maxChars`. Any remainder stays pending and the timer is
 * cleared — the caller schedules the next slice so the event loop can run.
 */
export function takePtyDataPendingLimited(
  state: PtyDataPendingState,
  sessionId: string,
  maxChars: number,
): { data: string; rest: boolean } {
  clearPendingTimer(state, sessionId);
  const buf = state.pending.get(sessionId);
  if (!buf || buf.length === 0) {
    state.pending.delete(sessionId);
    return { data: "", rest: false };
  }
  const limit = Math.max(1, maxChars);
  if (buf.length <= limit) {
    state.pending.delete(sessionId);
    return { data: materializePtyChunk(buf), rest: false };
  }
  const data = takePtyChunkPrefix(buf, limit);
  if (!data || buf.length === 0) {
    state.pending.delete(sessionId);
    return { data, rest: false };
  }
  return { data, rest: true };
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
  send: (data: string) => void,
  schedule: (run: () => void) => ReturnType<typeof setTimeout>,
  done: () => void,
): void {
  const { data, rest } = takePtyDataPendingLimited(state, sessionId, maxChars);
  if (data) send(data);
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

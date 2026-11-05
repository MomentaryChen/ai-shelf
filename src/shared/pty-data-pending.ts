/**
 * Coalesced PTY data broadcast state.
 *
 * `broadcastPtyData` appends into both the durable output buffer and a short
 * pending map flushed on a timer. When the renderer attaches with the full
 * buffer, that pending tail is already inside the buffer — flushing it again
 * double-paints the same chunk. `dropPtyDataPending` cancels that flush.
 */

export type PtyPendingChunk = {
  data: string;
  /** Total string units appended for this session after `data`. */
  endSeq: number;
};

export type PtyDataPendingState = {
  pending: Map<string, PtyPendingChunk>;
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
  const prev = state.pending.get(sessionId);
  state.pending.set(sessionId, {
    data: (prev?.data ?? "") + data,
    endSeq,
  });
  if (state.timers.has(sessionId)) return;
  const timer = setTimeout(() => {
    state.timers.delete(sessionId);
    flush(sessionId);
  }, coalesceMs);
  state.timers.set(sessionId, timer);
}

/** Cancel the coalesce timer and discard pending without sending. */
export function dropPtyDataPending(state: PtyDataPendingState, sessionId: string): void {
  const timer = state.timers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    state.timers.delete(sessionId);
  }
  state.pending.delete(sessionId);
}

/** Cancel the timer and take pending bytes for broadcast. */
export function takePtyDataPending(state: PtyDataPendingState, sessionId: string): PtyPendingChunk {
  const timer = state.timers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    state.timers.delete(sessionId);
  }
  const entry = state.pending.get(sessionId);
  state.pending.delete(sessionId);
  if (entry) return entry;
  return { data: "", endSeq: state.seq.get(sessionId) ?? 0 };
}

/**
 * Attach with `includeBuffer: true` replays the durable buffer, which already
 * contains any coalesced pending tail — drop pending so it is not re-sent.
 */
export function shouldDropPendingOnBufferAttach(includeBuffer: boolean): boolean {
  return includeBuffer;
}

/**
 * Coalesced PTY data broadcast state.
 *
 * `broadcastPtyData` appends into both the durable output buffer and a short
 * pending map flushed on a timer. When the renderer attaches with the full
 * buffer, that pending tail is already inside the buffer — flushing it again
 * double-paints the same chunk. `dropPtyDataPending` cancels that flush.
 */

export type PtyDataPendingState = {
  pending: Map<string, string>;
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
  const prev = state.pending.get(sessionId) ?? "";
  state.pending.set(sessionId, prev + data);
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
export function takePtyDataPending(state: PtyDataPendingState, sessionId: string): string {
  const timer = state.timers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    state.timers.delete(sessionId);
  }
  const data = state.pending.get(sessionId) ?? "";
  state.pending.delete(sessionId);
  return data;
}

/**
 * Attach with `includeBuffer: true` replays the durable buffer, which already
 * contains any coalesced pending tail — drop pending so it is not re-sent.
 */
export function shouldDropPendingOnBufferAttach(includeBuffer: boolean): boolean {
  return includeBuffer;
}

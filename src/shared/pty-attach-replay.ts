/**
 * Merge a PTY attach snapshot with bytes that already arrived on the live
 * channel. Claude's full-screen redraw is a cursor-addressed stream: writing
 * the same bytes twice paints every row again and the frame "runs off".
 *
 * `endSeq` is the total number of JS string units appended for the session
 * after `data`. The snapshot's `endSeq` covers the entire durable buffer,
 * including any tail that attach dropped from the coalesce queue.
 */

export type PtyDataChunk = {
  data: string;
  /** Units appended so far after this chunk. Missing when the sender is old. */
  endSeq?: number;
};

export type PtyReplayGate = {
  appliedSeq: number;
  attached: boolean;
  queue: PtyDataChunk[];
};

export function createPtyReplayGate(): PtyReplayGate {
  return { appliedSeq: 0, attached: false, queue: [] };
}

/**
 * Portion of `chunk` strictly after `appliedSeq`.
 * A chunk without `endSeq` is treated as already inside the snapshot.
 */
export function ptyBytesAfter(appliedSeq: number, chunk: PtyDataChunk): string {
  if (!chunk.data || !Number.isFinite(chunk.endSeq)) return "";
  const endSeq = chunk.endSeq as number;
  if (endSeq <= appliedSeq) return "";
  const startSeq = endSeq - chunk.data.length;
  if (startSeq >= appliedSeq) return chunk.data;
  const skip = appliedSeq - startSeq;
  if (skip >= chunk.data.length) return "";
  return chunk.data.slice(skip);
}

/**
 * Live bytes before attach are queued. After attach, returns only the slice
 * that is not already contained in the snapshot.
 */
export function pushPtyChunk(gate: PtyReplayGate, chunk: PtyDataChunk): string {
  if (!chunk.data) return "";
  if (!gate.attached) {
    gate.queue.push(chunk);
    return "";
  }
  const text = ptyBytesAfter(gate.appliedSeq, chunk);
  if (!text) return "";
  gate.appliedSeq = Number.isFinite(chunk.endSeq)
    ? (chunk.endSeq as number)
    : gate.appliedSeq + text.length;
  return text;
}

/**
 * Write the snapshot once, then any queued tail that landed after it.
 * Returns the strings to feed the terminal, in order.
 */
export function completePtyReplay(gate: PtyReplayGate, buffer: string, endSeq: number): string[] {
  const writes: string[] = [];
  if (buffer) writes.push(buffer);
  gate.appliedSeq = Number.isFinite(endSeq) ? endSeq : buffer.length;
  gate.attached = true;
  const queued = gate.queue;
  gate.queue = [];
  for (const chunk of queued) {
    const text = ptyBytesAfter(gate.appliedSeq, chunk);
    if (!text) continue;
    writes.push(text);
    gate.appliedSeq = chunk.endSeq as number;
  }
  return writes;
}

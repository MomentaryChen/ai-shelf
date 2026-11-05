/**
 * PTY transcripts are appended from many small reads. Joining them into one
 * string on every read copies the whole scrollback and blocks the main
 * process (Windows shows the window as not responding). Pieces stay separate
 * until something actually needs the full text.
 */

export type PtyPiece = {
  text: string;
  /** First live UTF-16 unit. Avoids copying the tail when a piece is split. */
  offset: number;
};

export type PtyChunkBuffer = {
  pieces: PtyPiece[];
  /** Index of the first live piece. */
  start: number;
  length: number;
};

export function createPtyChunkBuffer(): PtyChunkBuffer {
  return { pieces: [], start: 0, length: 0 };
}

function compact(buf: PtyChunkBuffer): void {
  if (buf.start === 0) return;
  buf.pieces = buf.pieces.slice(buf.start);
  buf.start = 0;
}

/**
 * Don't split a surrogate pair across IPC slices. `end` is exclusive.
 * If the pair is the whole budget, take both units so the slice still makes progress.
 */
export function clampUtf16SliceEnd(text: string, start: number, end: number): number {
  if (end >= text.length || end <= start) return end;
  const code = text.charCodeAt(end - 1);
  if (code < 0xd800 || code > 0xdbff) return end;
  if (end - start > 1) return end - 1;
  if (end < text.length) return end + 1;
  return end;
}

export function appendPtyChunk(buf: PtyChunkBuffer, data: string, maxChars: number): string | null {
  if (!data) return null;
  if (buf.start > 64) compact(buf);
  buf.pieces.push({ text: data, offset: 0 });
  buf.length += data.length;
  return trimPtyChunkBuffer(buf, maxChars);
}

/** Drop the front until `length <= maxChars`. Returns the kept text when trimmed. */
export function trimPtyChunkBuffer(buf: PtyChunkBuffer, maxChars: number): string | null {
  if (buf.length <= maxChars) return null;
  const text = materializePtyChunk(buf);
  const trimmed = text.slice(text.length - maxChars);
  buf.pieces = [{ text: trimmed, offset: 0 }];
  buf.start = 0;
  buf.length = trimmed.length;
  return trimmed;
}

export function materializePtyChunk(buf: PtyChunkBuffer): string {
  const parts: string[] = [];
  for (let i = buf.start; i < buf.pieces.length; i++) {
    const piece = buf.pieces[i];
    parts.push(piece.offset === 0 ? piece.text : piece.text.slice(piece.offset));
  }
  const text = parts.length === 0 ? "" : parts.length === 1 ? (parts[0] ?? "") : parts.join("");
  buf.pieces = text ? [{ text, offset: 0 }] : [];
  buf.start = 0;
  buf.length = text.length;
  return text;
}

/** Remove and return up to `maxChars` from the front. */
export function takePtyChunkPrefix(buf: PtyChunkBuffer, maxChars: number): string {
  if (maxChars <= 0 || buf.length === 0) return "";
  if (buf.length <= maxChars) {
    const text = materializePtyChunk(buf);
    buf.pieces = [];
    buf.start = 0;
    buf.length = 0;
    return text;
  }

  let need = maxChars;
  const out: string[] = [];
  while (need > 0 && buf.start < buf.pieces.length) {
    const piece = buf.pieces[buf.start];
    const available = piece.text.length - piece.offset;
    if (available <= need) {
      out.push(piece.offset === 0 ? piece.text : piece.text.slice(piece.offset));
      buf.start += 1;
      buf.length -= available;
      need -= available;
      continue;
    }
    const end = clampUtf16SliceEnd(piece.text, piece.offset, piece.offset + need);
    const taken = end - piece.offset;
    if (taken <= 0) break;
    out.push(piece.text.slice(piece.offset, end));
    piece.offset = end;
    buf.length -= taken;
    need -= taken;
  }

  if (buf.length === 0) {
    buf.pieces = [];
    buf.start = 0;
  } else if (buf.start > 64) {
    compact(buf);
  }

  return out.length === 1 ? (out[0] ?? "") : out.join("");
}

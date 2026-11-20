import { open } from "node:fs/promises";

export interface JsonlReadOptions {
  /** Stop after reading this many bytes (default: whole file). */
  maxBytes?: number;
  /** Lines longer than this are skipped without being buffered (default 2 MiB). */
  maxLineBytes?: number;
  /** Read chunk size (default 64 KiB). */
  chunkBytes?: number;
  /** Polled between chunks; return true to stop early. */
  shouldStop?: () => boolean;
}

const NEWLINE = 0x0a;

/**
 * Stream a JSONL file line by line with bounded memory. Oversized lines (e.g. Claude
 * Code `api-request-blob` records) are dropped instead of being buffered, and a
 * trailing line without a newline is still yielded. Never throws for a missing or
 * unreadable file — it just yields nothing more.
 */
export async function* readJsonlLines(
  filePath: string,
  opts: JsonlReadOptions = {},
): AsyncGenerator<string> {
  const maxBytes = opts.maxBytes ?? Number.POSITIVE_INFINITY;
  const maxLine = opts.maxLineBytes ?? 2 * 1024 * 1024;
  const chunk = Buffer.allocUnsafe(opts.chunkBytes ?? 64 * 1024);
  let handle;
  try {
    handle = await open(filePath, "r");
  } catch {
    return;
  }
  try {
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    let skipping = false;
    let total = 0;
    while (total < maxBytes) {
      if (opts.shouldStop?.()) return;
      let bytesRead: number;
      try {
        ({ bytesRead } = await handle.read(
          chunk,
          0,
          Math.min(chunk.length, maxBytes - total),
          null,
        ));
      } catch {
        return;
      }
      if (bytesRead <= 0) break;
      total += bytesRead;
      let start = 0;
      while (start < bytesRead) {
        const nl = chunk.indexOf(NEWLINE, start);
        const end = nl === -1 || nl >= bytesRead ? bytesRead : nl;
        const piece = end - start;
        if (!skipping) {
          if (pendingBytes + piece > maxLine) {
            skipping = true;
            pending = [];
            pendingBytes = 0;
          } else if (piece > 0) {
            pending.push(Buffer.from(chunk.subarray(start, end)));
            pendingBytes += piece;
          }
        }
        if (end === bytesRead) break; // line continues in the next chunk
        // End of line.
        if (!skipping && pendingBytes > 0) {
          const line = Buffer.concat(pending, pendingBytes).toString("utf8");
          pending = [];
          pendingBytes = 0;
          yield line;
        }
        skipping = false;
        start = end + 1;
      }
    }
    // Last line without a trailing newline (only when the whole file was read).
    if (!skipping && pendingBytes > 0 && total < maxBytes) {
      yield Buffer.concat(pending, pendingBytes).toString("utf8");
    }
  } finally {
    await handle.close().catch(() => {});
  }
}

/** Ring buffer for PTY output preview (last N bytes per session). */
export class OutputBuffer {
  private readonly chunks = new Map<string, string>();
  private readonly maxBytes: number;

  constructor(maxBytesPerSession = 32_768) {
    this.maxBytes = maxBytesPerSession;
  }

  append(runtimeId: string, data: string): void {
    const prev = this.chunks.get(runtimeId) ?? "";
    const combined = prev + data;
    this.chunks.set(
      runtimeId,
      combined.length > this.maxBytes ? combined.slice(-this.maxBytes) : combined,
    );
  }

  getPreview(runtimeId: string, maxChars = 4096): string {
    const raw = this.chunks.get(runtimeId) ?? "";
    return raw.length > maxChars ? raw.slice(-maxChars) : raw;
  }

  clear(runtimeId: string): void {
    this.chunks.delete(runtimeId);
  }
}

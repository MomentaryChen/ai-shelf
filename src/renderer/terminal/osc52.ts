/**
 * OSC 52 clipboard write — pure parsing and policy (no DOM / xterm), unit tested.
 *
 * `ESC ] 52 ; Pc ; Pd BEL` — Pc selects the clipboard(s), Pd is base64 text.
 * Only writes are supported: `Pd = "?"` (read the clipboard back) is refused,
 * since any program in the pane — or `cat` of a hostile file — could
 * otherwise exfiltrate the clipboard.
 */

export type Osc52Mode = "off" | "ask" | "always";

export const OSC52_MODES: readonly Osc52Mode[] = ["off", "ask", "always"];
export const DEFAULT_OSC52_MODE: Osc52Mode = "ask";

/** Largest decoded payload accepted (bytes). */
export const OSC52_MAX_BYTES = 1024 * 1024;

export type Osc52Request =
  | { kind: "write"; text: string; bytes: number }
  | { kind: "query" }
  | { kind: "too-large"; bytes: number }
  | { kind: "invalid" };

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function normalizeOsc52Mode(raw: unknown): Osc52Mode {
  return typeof raw === "string" && (OSC52_MODES as readonly string[]).includes(raw)
    ? (raw as Osc52Mode)
    : DEFAULT_OSC52_MODE;
}

/** Decoded size of a base64 string without decoding it. */
function base64DecodedBytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/** Parse the payload xterm hands an OSC 52 handler (`Pc;Pd`). */
export function parseOsc52(data: string, maxBytes = OSC52_MAX_BYTES): Osc52Request {
  const sep = data.indexOf(";");
  if (sep < 0) return { kind: "invalid" };
  const selection = data.slice(0, sep);
  const payload = data.slice(sep + 1);
  if (!/^[cpqs0-7]*$/.test(selection)) return { kind: "invalid" };
  if (payload === "?") return { kind: "query" };
  // Empty Pd means "clear the clipboard" — not a write we perform.
  if (!payload) return { kind: "invalid" };
  // Size check before validating or decoding, so a huge payload costs nothing.
  const bytes = base64DecodedBytes(payload);
  if (bytes > maxBytes) return { kind: "too-large", bytes };
  if (payload.length % 4 === 1 || !BASE64_RE.test(payload)) return { kind: "invalid" };
  try {
    const binary = atob(payload);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    const text = new TextDecoder("utf-8").decode(buf);
    if (!text) return { kind: "invalid" };
    return { kind: "write", text, bytes: buf.length };
  } catch {
    return { kind: "invalid" };
  }
}

/** Same text written again within this window is skipped (TUIs re-emit while redrawing). */
export const OSC52_DEDUPE_MS = 5_000;
/** After the user denies a request, further requests from that pane are dropped for this long. */
export const OSC52_DENY_MUTE_MS = 30_000;

export type Osc52Decision = "write" | "ask" | "drop";

/** Per-pane OSC 52 policy: mode, duplicate suppression, mute after deny. */
export class Osc52Gate {
  private last: { text: string; at: number } | null = null;
  private mutedUntil = 0;

  decide(text: string, mode: Osc52Mode, now: number): Osc52Decision {
    if (mode === "off") return "drop";
    if (this.last && this.last.text === text && now - this.last.at < OSC52_DEDUPE_MS) return "drop";
    if (mode === "always") return "write";
    if (now < this.mutedUntil) return "drop";
    return "ask";
  }

  noteWritten(text: string, now: number): void {
    this.last = { text, at: now };
  }

  noteDenied(now: number): void {
    this.mutedUntil = now + OSC52_DENY_MUTE_MS;
  }
}

/** `512 B`, `1.5 KB`, `1.0 MB`. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

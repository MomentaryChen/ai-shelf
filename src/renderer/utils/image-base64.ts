/** Image ↔ Base64 helpers for Tools → Codec. */

export type ImageBase64Format = "dataUrl" | "raw";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(input: string): Uint8Array<ArrayBuffer> {
  let b64 = input.trim().replace(/\s+/gu, "");
  if (/[-_]/u.test(b64)) b64 = b64.replace(/-/gu, "+").replace(/_/gu, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(b64)) {
    throw new Error("Invalid base64");
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export async function imageFileToBase64(
  file: File,
  format: ImageBase64Format = "dataUrl",
): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file);
  const b64 = bytesToBase64(new Uint8Array(buffer));
  if (format === "raw") return b64;
  const mime = file.type || sniffImageMime(new Uint8Array(buffer)) || "application/octet-stream";
  return `data:${mime};base64,${b64}`;
}

/** Strip common paste wrappers (quotes, surrounding whitespace). */
export function normalizeImageBase64Input(input: string): string {
  let s = input.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith("`") && s.endsWith("`"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Parse a data URL. Accepts optional parameters between mime and `;base64`
 * (e.g. `data:image/png;name=foo.png;base64,...`).
 */
export function parseDataUrl(input: string): { mime: string; base64: string } | null {
  const trimmed = normalizeImageBase64Input(input);
  const match = /^data:([^;,]+)?((?:;[^;,=]+=[^;,]+)*)?;base64,(.+)$/isu.exec(trimmed);
  if (!match) return null;
  return { mime: match[1] || "application/octet-stream", base64: match[3]! };
}

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x39 || bytes[4] === 0x37) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  return null;
}

export function base64ToObjectUrl(base64OrDataUrl: string, fallbackMime = "image/png"): string {
  const normalized = normalizeImageBase64Input(base64OrDataUrl);
  const parsed = parseDataUrl(normalized);
  const b64 = parsed?.base64 ?? normalized;
  const bytes = base64ToBytes(b64);
  if (bytes.byteLength === 0) throw new Error("Empty image data");
  const mime = parsed?.mime ?? sniffImageMime(bytes) ?? fallbackMime;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  return URL.createObjectURL(blob);
}

/** Convert raw base64 → data URL using sniffed mime when possible. */
export function rawBase64ToDataUrl(raw: string, fallbackMime = "image/png"): string {
  const bytes = base64ToBytes(raw);
  const mime = sniffImageMime(bytes) ?? fallbackMime;
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

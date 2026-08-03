/** Image ↔ Base64 helpers for Tools → Codec. */

export type ImageBase64Format = "dataUrl" | "raw";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(input: string): Uint8Array {
  let b64 = input.trim().replace(/\s+/gu, "");
  if (/[-_]/u.test(b64)) b64 = b64.replace(/-/gu, "+").replace(/_/gu, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
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
  const mime = file.type || "application/octet-stream";
  return `data:${mime};base64,${b64}`;
}

export function parseDataUrl(input: string): { mime: string; base64: string } | null {
  const trimmed = input.trim();
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/isu.exec(trimmed);
  if (!match) return null;
  return { mime: match[1] || "application/octet-stream", base64: match[2]! };
}

export function base64ToObjectUrl(base64OrDataUrl: string, fallbackMime = "image/png"): string {
  const parsed = parseDataUrl(base64OrDataUrl);
  const mime = parsed?.mime ?? fallbackMime;
  const b64 = parsed?.base64 ?? base64OrDataUrl.trim().replace(/\s+/gu, "");
  const bytes = base64ToBytes(b64);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  return URL.createObjectURL(blob);
}

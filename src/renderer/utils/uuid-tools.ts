/** Pure ID helpers for Tools → UUID / NanoID. */

export type UuidVersion = 4 | 7;

export type NanoidAlphabetId = "url" | "alphanumeric" | "numbers" | "lowercase" | "uppercase";

export type UuidVariant = "rfc4122" | "reserved" | "microsoft" | "ncs" | "unknown";

export type UuidParseResult =
  | {
      ok: true;
      canonical: string;
      version: number | null;
      variant: UuidVariant;
    }
  | { ok: false; reason: "empty" | "invalid" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** URL-friendly alphabet used by the reference NanoID (64 chars). */
export const NANOID_ALPHABETS: Record<NanoidAlphabetId, string> = {
  url: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
  alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  numbers: "0123456789",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
};

export const DEFAULT_NANOID_SIZE = 21;
export const MIN_NANOID_SIZE = 1;
export const MAX_NANOID_SIZE = 64;
export const MIN_ID_COUNT = 1;
export const MAX_ID_COUNT = 100;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function clampIdCount(count: number): number {
  return clampInt(count, MIN_ID_COUNT, MAX_ID_COUNT);
}

export function clampNanoidSize(size: number): number {
  return clampInt(size, MIN_NANOID_SIZE, MAX_NANOID_SIZE);
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i]!.toString(16).padStart(2, "0"));
  }
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

/** RFC 4122 / 9562 UUID version 4 (random). */
export function generateUuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

/**
 * RFC 9562 UUID version 7 (Unix-ms timestamp + random).
 * Layout: 48-bit ms | ver(4) | rand_a(12) | var(2) | rand_b(62).
 */
export function generateUuidV7(nowMs: number = Date.now()): string {
  const ms = Math.max(0, Math.trunc(nowMs));
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ts = BigInt(ms);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  return bytesToUuid(bytes);
}

export function generateUuid(version: UuidVersion, nowMs?: number): string {
  return version === 7 ? generateUuidV7(nowMs) : generateUuidV4();
}

export function generateUuids(
  version: UuidVersion,
  count: number,
  options?: { uppercase?: boolean; nowMs?: number },
): string[] {
  const n = clampIdCount(count);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let id = generateUuid(version, options?.nowMs);
    if (options?.uppercase) id = id.toUpperCase();
    out.push(id);
  }
  return out;
}

/**
 * Uniform NanoID using rejection sampling (same approach as the reference implementation).
 * Alphabet length must be > 1; size is clamped to 1–64.
 */
export function generateNanoid(
  size: number = DEFAULT_NANOID_SIZE,
  alphabet: string = NANOID_ALPHABETS.url,
): string {
  const len = clampNanoidSize(size);
  if (alphabet.length < 2) {
    throw new Error("Alphabet must contain at least 2 characters");
  }
  // Same mask formula as the reference NanoID implementation.
  const mask = (2 << Math.floor(Math.log2(alphabet.length - 1))) - 1;
  const step = Math.ceil((1.6 * mask * len) / alphabet.length);
  let id = "";
  while (id.length < len) {
    const bytes = new Uint8Array(step);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && id.length < len; i++) {
      const idx = bytes[i]! & mask;
      if (idx < alphabet.length) id += alphabet[idx]!;
    }
  }
  return id;
}

export function generateNanoids(
  count: number,
  size: number = DEFAULT_NANOID_SIZE,
  alphabet: string = NANOID_ALPHABETS.url,
): string[] {
  const n = clampIdCount(count);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(generateNanoid(size, alphabet));
  return out;
}

function variantFromNibble(nibble: number): UuidVariant {
  // High nibble of clock_seq_hi_and_reserved: RFC 4122 uses 10xx
  if ((nibble & 0b1100) === 0b1000) return "rfc4122";
  if ((nibble & 0b1110) === 0b1100) return "microsoft";
  if ((nibble & 0b1110) === 0b1110) return "reserved";
  return "ncs";
}

/** Normalize and inspect a UUID string (with or without braces / urn:). */
export function parseUuid(input: string): UuidParseResult {
  let raw = input.trim();
  if (!raw) return { ok: false, reason: "empty" };

  if (raw.startsWith("{") && raw.endsWith("}")) raw = raw.slice(1, -1);
  if (/^urn:uuid:/iu.test(raw)) raw = raw.slice(9);

  // Allow compact (no hyphens) form
  const compact = raw.replace(/-/gu, "");
  if (/^[0-9a-f]{32}$/iu.test(compact)) {
    raw =
      compact.slice(0, 8) +
      "-" +
      compact.slice(8, 12) +
      "-" +
      compact.slice(12, 16) +
      "-" +
      compact.slice(16, 20) +
      "-" +
      compact.slice(20, 32);
  }

  if (!UUID_RE.test(raw)) return { ok: false, reason: "invalid" };

  const canonical = raw.toLowerCase();
  const versionNibble = Number.parseInt(canonical[14]!, 16);
  const variantNibble = Number.parseInt(canonical[19]!, 16);

  return {
    ok: true,
    canonical,
    version: versionNibble >= 1 && versionNibble <= 8 ? versionNibble : null,
    variant: variantFromNibble(variantNibble),
  };
}

export function isValidUuid(input: string): boolean {
  return parseUuid(input).ok;
}

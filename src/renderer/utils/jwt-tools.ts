/** JWT helpers for Tools → JWT (decode / verify / encode). Client-side only. */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type JwtHsAlg = "HS256" | "HS384" | "HS512";
export type JwtRsAlg = "RS256" | "RS384" | "RS512";
export type JwtEsAlg = "ES256" | "ES384" | "ES512";
export type JwtAlg = JwtHsAlg | JwtRsAlg | JwtEsAlg | "none";

export type DecodedJwt = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  headerJson: string;
  payloadJson: string;
  signatureB64u: string;
  alg: string;
  signingInput: string;
};

export type ClaimTimeInfo = {
  epochMs: number;
  isoUtc: string;
  relative: string;
  expired: boolean;
  notYetValid: boolean;
};

export type JwtVerifyResult = {
  signatureValid: boolean;
  expired: boolean | null;
  notYetValid: boolean | null;
  alg: string;
};

const HS_HASH: Record<JwtHsAlg, string> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

const RS_HASH: Record<JwtRsAlg, string> = {
  RS256: "SHA-256",
  RS384: "SHA-384",
  RS512: "SHA-512",
};

const ES_CURVE: Record<JwtEsAlg, EcKeyGenParams["namedCurve"]> = {
  ES256: "P-256",
  ES384: "P-384",
  ES512: "P-521",
};

const ES_HASH: Record<JwtEsAlg, string> = {
  ES256: "SHA-256",
  ES384: "SHA-384",
  ES512: "SHA-512",
};

const ES_SIG_LEN: Record<JwtEsAlg, number> = {
  ES256: 64,
  ES384: 96,
  ES512: 132,
};

function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return binary;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function base64UrlDecode(input: string): Uint8Array {
  let b64 = input.trim().replace(/-/gu, "+").replace(/_/gu, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return binaryToBytes(atob(b64));
}

export function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(textEncoder.encode(JSON.stringify(value)));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function parseJwt(token: string): DecodedJwt {
  const raw = token.trim().replace(/^Bearer\s+/iu, "");
  if (!raw) throw new Error("Empty token");

  const parts = raw.split(".");
  if (parts.length !== 3) throw new Error("JWT must have three parts (header.payload.signature)");

  const [headerB64u, payloadB64u, signatureB64u] = parts as [string, string, string];
  if (!headerB64u || !payloadB64u) throw new Error("JWT header or payload is empty");

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(textDecoder.decode(base64UrlDecode(headerB64u)));
  } catch {
    throw new Error("Invalid JWT header (not Base64URL JSON)");
  }
  try {
    payload = JSON.parse(textDecoder.decode(base64UrlDecode(payloadB64u)));
  } catch {
    throw new Error("Invalid JWT payload (not Base64URL JSON)");
  }

  if (!isPlainObject(header)) throw new Error("JWT header must be a JSON object");
  if (!isPlainObject(payload)) throw new Error("JWT payload must be a JSON object");

  const alg = typeof header.alg === "string" ? header.alg : "unknown";

  return {
    header,
    payload,
    headerJson: prettyJson(header),
    payloadJson: prettyJson(payload),
    signatureB64u,
    alg,
    signingInput: `${headerB64u}.${payloadB64u}`,
  };
}

export function formatRelative(epochMs: number, nowMs: number): string {
  const delta = epochMs - nowMs;
  const abs = Math.abs(delta);
  const suffix = delta < 0 ? "ago" : "from now";
  if (abs < 1_000) return "just now";
  const sec = Math.floor(abs / 1_000);
  if (sec < 60) return `${sec}s ${suffix}`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec ? `${min}m ${remSec}s ${suffix}` : `${min}m ${suffix}`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 48) return remMin ? `${hr}h ${remMin}m ${suffix}` : `${hr}h ${suffix}`;
  const days = Math.floor(hr / 24);
  return `${days}d ${suffix}`;
}

export function formatClaimTime(value: unknown, nowMs = Date.now()): ClaimTimeInfo | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // JWT numeric dates are seconds since epoch
  const epochMs = value > 1e12 ? value : value * 1000;
  return {
    epochMs,
    isoUtc: new Date(epochMs).toISOString(),
    relative: formatRelative(epochMs, nowMs),
    expired: epochMs < nowMs,
    notYetValid: epochMs > nowMs,
  };
}

function isHsAlg(alg: string): alg is JwtHsAlg {
  return alg === "HS256" || alg === "HS384" || alg === "HS512";
}

function isRsAlg(alg: string): alg is JwtRsAlg {
  return alg === "RS256" || alg === "RS384" || alg === "RS512";
}

function isEsAlg(alg: string): alg is JwtEsAlg {
  return alg === "ES256" || alg === "ES384" || alg === "ES512";
}

function pemUnwrap(pem: string, label: string): ArrayBuffer {
  const re = new RegExp(`-----BEGIN ${label}-----[\\s\\S]*?-----END ${label}-----`, "u");
  const block = re.exec(pem)?.[0];
  if (!block) throw new Error(`Missing PEM ${label} block`);
  let b64 = block
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s+/gu, "");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  const der = binaryToBytes(atob(b64));
  return der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importHsKey(secret: string, alg: JwtHsAlg, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = textEncoder.encode(secret);
  if (!raw.length) throw new Error("HMAC secret is empty");
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: HS_HASH[alg] }, false, usage);
}

async function importRsPublic(pem: string, alg: JwtRsAlg): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemUnwrap(pem, "PUBLIC KEY"),
    { name: "RSASSA-PKCS1-v1_5", hash: RS_HASH[alg] },
    false,
    ["verify"],
  );
}

async function importRsPrivate(pem: string, alg: JwtRsAlg): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemUnwrap(pem, "PRIVATE KEY"),
    { name: "RSASSA-PKCS1-v1_5", hash: RS_HASH[alg] },
    false,
    ["sign"],
  );
}

async function importEsPublic(pem: string, alg: JwtEsAlg): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemUnwrap(pem, "PUBLIC KEY"),
    { name: "ECDSA", namedCurve: ES_CURVE[alg] },
    false,
    ["verify"],
  );
}

async function importEsPrivate(pem: string, alg: JwtEsAlg): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemUnwrap(pem, "PRIVATE KEY"),
    { name: "ECDSA", namedCurve: ES_CURVE[alg] },
    false,
    ["sign"],
  );
}

export async function verifyJwt(
  token: string,
  keyMaterial: string,
  options?: { nowMs?: number; checkTime?: boolean },
): Promise<JwtVerifyResult> {
  const decoded = parseJwt(token);
  const alg = decoded.alg;
  const nowMs = options?.nowMs ?? Date.now();
  const checkTime = options?.checkTime !== false;

  let signatureValid = false;

  if (alg === "none") {
    signatureValid = decoded.signatureB64u === "";
  } else if (isHsAlg(alg)) {
    const key = await importHsKey(keyMaterial, alg, ["verify"]);
    signatureValid = await crypto.subtle.verify(
      "HMAC",
      key,
      asBufferSource(base64UrlDecode(decoded.signatureB64u)),
      textEncoder.encode(decoded.signingInput),
    );
  } else if (isRsAlg(alg)) {
    const key = await importRsPublic(keyMaterial, alg);
    signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      asBufferSource(base64UrlDecode(decoded.signatureB64u)),
      textEncoder.encode(decoded.signingInput),
    );
  } else if (isEsAlg(alg)) {
    const key = await importEsPublic(keyMaterial, alg);
    const sig = base64UrlDecode(decoded.signatureB64u);
    if (sig.length !== ES_SIG_LEN[alg]) {
      throw new Error(`ECDSA signature must be ${ES_SIG_LEN[alg]} bytes for ${alg}`);
    }
    signatureValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: ES_HASH[alg] },
      key,
      asBufferSource(sig),
      textEncoder.encode(decoded.signingInput),
    );
  } else {
    throw new Error(`Unsupported alg: ${alg}`);
  }

  let expired: boolean | null = null;
  let notYetValid: boolean | null = null;
  if (checkTime) {
    const exp = formatClaimTime(decoded.payload.exp, nowMs);
    const nbf = formatClaimTime(decoded.payload.nbf, nowMs);
    if (exp) expired = exp.expired;
    if (nbf) notYetValid = nbf.notYetValid;
  }

  return { signatureValid, expired, notYetValid, alg };
}

export async function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  keyMaterial: string,
): Promise<string> {
  const alg = typeof header.alg === "string" ? header.alg : "";
  if (!alg) throw new Error('Header must include "alg"');

  const headerB64u = base64UrlEncodeJson(header);
  const payloadB64u = base64UrlEncodeJson(payload);
  const signingInput = `${headerB64u}.${payloadB64u}`;

  if (alg === "none") {
    return `${signingInput}.`;
  }

  let signature: ArrayBuffer;

  if (isHsAlg(alg)) {
    const key = await importHsKey(keyMaterial, alg, ["sign"]);
    signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(signingInput));
  } else if (isRsAlg(alg)) {
    const key = await importRsPrivate(keyMaterial, alg);
    signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, textEncoder.encode(signingInput));
  } else if (isEsAlg(alg)) {
    const key = await importEsPrivate(keyMaterial, alg);
    signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: ES_HASH[alg] },
      key,
      textEncoder.encode(signingInput),
    );
  } else {
    throw new Error(`Unsupported alg: ${alg}`);
  }

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export function defaultEncodeHeader(alg: JwtAlg = "HS256"): Record<string, unknown> {
  return { alg, typ: "JWT" };
}

export function defaultEncodePayload(nowMs = Date.now()): Record<string, unknown> {
  const iat = Math.floor(nowMs / 1000);
  return {
    sub: "user",
    iat,
    exp: iat + 3600,
  };
}

export function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

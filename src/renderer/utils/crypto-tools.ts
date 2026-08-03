/** Web Crypto helpers for Tools → Crypto (AES / RSA / ECDSA). */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type AesMode = "AES-GCM" | "AES-CBC";
export type AesKeyBits = 128 | 256;
export type RsaModulusBits = 2048 | 4096;
export type EcCurve = "P-256" | "P-384" | "P-521";

/** ArrayBuffer-backed views — required by Web Crypto BufferSource under TS 5.7+/6. */
type CryptoBytes = Uint8Array<ArrayBuffer>;

function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return binary;
}

function binaryToBytes(binary: string): CryptoBytes {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(input: string): CryptoBytes {
  let hex = input.trim().replace(/[\s:_-]/gu, "");
  if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/u.test(hex)) {
    throw new Error("Invalid hex");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes));
}

export function base64ToBytes(input: string): CryptoBytes {
  let b64 = input.trim().replace(/\s+/gu, "");
  if (/[-_]/u.test(b64)) b64 = b64.replace(/-/gu, "+").replace(/_/gu, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return binaryToBytes(atob(b64));
}

export function randomBytes(length: number): CryptoBytes {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function ivLengthFor(mode: AesMode): number {
  return mode === "AES-GCM" ? 12 : 16;
}

function keyLengthFor(bits: AesKeyBits): number {
  return bits / 8;
}

async function importAesKey(keyHex: string, mode: AesMode, bits: AesKeyBits): Promise<CryptoKey> {
  const raw = hexToBytes(keyHex);
  if (raw.length !== keyLengthFor(bits)) {
    throw new Error(`AES-${bits} key must be ${keyLengthFor(bits)} bytes (${bits / 4} hex chars)`);
  }
  return crypto.subtle.importKey("raw", raw, { name: mode }, false, ["encrypt", "decrypt"]);
}

export function generateAesKeyHex(bits: AesKeyBits): string {
  return bytesToHex(randomBytes(keyLengthFor(bits)));
}

export function generateAesIvHex(mode: AesMode): string {
  return bytesToHex(randomBytes(ivLengthFor(mode)));
}

export async function aesEncrypt(
  plaintext: string,
  keyHex: string,
  ivHex: string,
  mode: AesMode,
  bits: AesKeyBits,
): Promise<string> {
  const key = await importAesKey(keyHex, mode, bits);
  const iv = hexToBytes(ivHex);
  if (iv.length !== ivLengthFor(mode)) {
    throw new Error(`${mode} IV must be ${ivLengthFor(mode)} bytes`);
  }
  const params: AesGcmParams | AesCbcParams =
    mode === "AES-GCM" ? { name: mode, iv } : { name: mode, iv };
  const cipher = await crypto.subtle.encrypt(params, key, textEncoder.encode(plaintext));
  return bytesToBase64(new Uint8Array(cipher));
}

export async function aesDecrypt(
  ciphertextB64: string,
  keyHex: string,
  ivHex: string,
  mode: AesMode,
  bits: AesKeyBits,
): Promise<string> {
  const key = await importAesKey(keyHex, mode, bits);
  const iv = hexToBytes(ivHex);
  if (iv.length !== ivLengthFor(mode)) {
    throw new Error(`${mode} IV must be ${ivLengthFor(mode)} bytes`);
  }
  const params: AesGcmParams | AesCbcParams =
    mode === "AES-GCM" ? { name: mode, iv } : { name: mode, iv };
  const plain = await crypto.subtle.decrypt(params, key, base64ToBytes(ciphertextB64));
  return textDecoder.decode(plain);
}

function pemWrap(label: string, der: ArrayBuffer): string {
  const b64 = bytesToBase64(new Uint8Array(der));
  const lines = b64.match(/.{1,64}/gu) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function pemUnwrap(pem: string, label: string): ArrayBuffer {
  const re = new RegExp(
    `-----BEGIN ${label}-----[\\s\\S]*?-----END ${label}-----`,
    "u",
  );
  const block = re.exec(pem)?.[0];
  if (!block) throw new Error(`Missing PEM ${label} block`);
  const b64 = block
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s+/gu, "");
  const bytes = base64ToBytes(b64);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export type RsaKeyPairPem = { publicKey: string; privateKey: string };

export async function generateRsaKeyPair(modulusLength: RsaModulusBits): Promise<RsaKeyPairPem> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return {
    publicKey: pemWrap("PUBLIC KEY", spki),
    privateKey: pemWrap("PRIVATE KEY", pkcs8),
  };
}

async function importRsaPublic(pem: string, usage: KeyUsage[]): Promise<CryptoKey> {
  const name = usage.includes("encrypt") ? "RSA-OAEP" : "RSA-PSS";
  return crypto.subtle.importKey(
    "spki",
    pemUnwrap(pem, "PUBLIC KEY"),
    { name, hash: "SHA-256" },
    false,
    usage,
  );
}

async function importRsaPrivate(pem: string, usage: KeyUsage[]): Promise<CryptoKey> {
  const name = usage.includes("decrypt") ? "RSA-OAEP" : "RSA-PSS";
  return crypto.subtle.importKey(
    "pkcs8",
    pemUnwrap(pem, "PRIVATE KEY"),
    { name, hash: "SHA-256" },
    false,
    usage,
  );
}

export async function rsaEncrypt(plaintext: string, publicKeyPem: string): Promise<string> {
  const key = await importRsaPublic(publicKeyPem, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, textEncoder.encode(plaintext));
  return bytesToBase64(new Uint8Array(cipher));
}

export async function rsaDecrypt(ciphertextB64: string, privateKeyPem: string): Promise<string> {
  const key = await importRsaPrivate(privateKeyPem, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    key,
    base64ToBytes(ciphertextB64),
  );
  return textDecoder.decode(plain);
}

export async function rsaSign(message: string, privateKeyPem: string): Promise<string> {
  const key = await importRsaPrivate(privateKeyPem, ["sign"]);
  const sig = await crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    key,
    textEncoder.encode(message),
  );
  return bytesToBase64(new Uint8Array(sig));
}

export async function rsaVerify(
  message: string,
  signatureB64: string,
  publicKeyPem: string,
): Promise<boolean> {
  const key = await importRsaPublic(publicKeyPem, ["verify"]);
  return crypto.subtle.verify(
    { name: "RSA-PSS", saltLength: 32 },
    key,
    base64ToBytes(signatureB64),
    textEncoder.encode(message),
  );
}

/** Generate an RSA-PSS key pair for sign/verify (separate from OAEP encrypt keys). */
export async function generateRsaSignKeyPair(
  modulusLength: RsaModulusBits,
): Promise<RsaKeyPairPem> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-PSS",
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return {
    publicKey: pemWrap("PUBLIC KEY", spki),
    privateKey: pemWrap("PRIVATE KEY", pkcs8),
  };
}

export type EcKeyPairPem = { publicKey: string; privateKey: string };

export async function generateEcKeyPair(namedCurve: EcCurve): Promise<EcKeyPairPem> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve },
    true,
    ["sign", "verify"],
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return {
    publicKey: pemWrap("PUBLIC KEY", spki),
    privateKey: pemWrap("PRIVATE KEY", pkcs8),
  };
}

function ecdsaHashFor(curve: EcCurve): "SHA-256" | "SHA-384" | "SHA-512" {
  if (curve === "P-384") return "SHA-384";
  if (curve === "P-521") return "SHA-512";
  return "SHA-256";
}

async function importEcPublic(pem: string, namedCurve: EcCurve): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemUnwrap(pem, "PUBLIC KEY"),
    { name: "ECDSA", namedCurve },
    false,
    ["verify"],
  );
}

async function importEcPrivate(pem: string, namedCurve: EcCurve): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemUnwrap(pem, "PRIVATE KEY"),
    { name: "ECDSA", namedCurve },
    false,
    ["sign"],
  );
}

export async function ecdsaSign(
  message: string,
  privateKeyPem: string,
  namedCurve: EcCurve,
): Promise<string> {
  const key = await importEcPrivate(privateKeyPem, namedCurve);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: ecdsaHashFor(namedCurve) },
    key,
    textEncoder.encode(message),
  );
  return bytesToBase64(new Uint8Array(sig));
}

export async function ecdsaVerify(
  message: string,
  signatureB64: string,
  publicKeyPem: string,
  namedCurve: EcCurve,
): Promise<boolean> {
  const key = await importEcPublic(publicKeyPem, namedCurve);
  return crypto.subtle.verify(
    { name: "ECDSA", hash: ecdsaHashFor(namedCurve) },
    key,
    base64ToBytes(signatureB64),
    textEncoder.encode(message),
  );
}

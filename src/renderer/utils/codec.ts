/** Pure codec helpers for the inventory Codec tools tab (UTF-8 safe). */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

export function encodeBase64(text: string, urlSafe = false): string {
  const b64 = btoa(bytesToBinary(textEncoder.encode(text)));
  if (!urlSafe) return b64;
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function decodeBase64(input: string, urlSafe = false): string {
  let b64 = input.trim().replace(/\s+/gu, "");
  // Accept URL-safe alphabet when opted in, or when the payload clearly uses it.
  if (urlSafe || /[-_]/u.test(b64)) b64 = b64.replace(/-/gu, "+").replace(/_/gu, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return textDecoder.decode(binaryToBytes(atob(b64)));
}

export function encodeUrl(text: string): string {
  return encodeURIComponent(text);
}

export function decodeUrl(text: string): string {
  return decodeURIComponent(text.trim());
}

export function encodeHex(text: string): string {
  return toHex(textEncoder.encode(text));
}

export function decodeHex(input: string): string {
  let hex = input.trim().replace(/[\s:_-]/gu, "");
  if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
  if (!hex) return "";
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/u.test(hex)) {
    throw new Error("Invalid hex");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return textDecoder.decode(bytes);
}

/** Compact MD5 (RFC 1321) — Web Crypto does not expose MD5. */
export function md5Hex(text: string): string {
  const bytes = textEncoder.encode(text);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] ?? 0) | (bytes[i]! << ((i % 4) * 8));
  }
  const bitLen = bytes.length * 8;
  words[bytes.length >> 2] = (words[bytes.length >> 2] ?? 0) | (0x80 << ((bytes.length % 4) * 8));
  const size = (((bytes.length + 8) >> 6) + 1) * 16;
  words.length = size;
  words[size - 2] = bitLen & 0xffffffff;
  words[size - 1] = (bitLen / 0x100000000) | 0;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  const add = (x: number, y: number) => (x + y) | 0;
  const F = (x: number, y: number, z: number) => (x & y) | (~x & z);
  const G = (x: number, y: number, z: number) => (x & z) | (y & ~z);
  const H = (x: number, y: number, z: number) => x ^ y ^ z;
  const I = (x: number, y: number, z: number) => y ^ (x | ~z);

  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
    20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
    10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  for (let i = 0; i < size; i += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;
    for (let j = 0; j < 64; j++) {
      let f: number;
      let g: number;
      if (j < 16) {
        f = F(b, c, d);
        g = j;
      } else if (j < 32) {
        f = G(b, c, d);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = H(b, c, d);
        g = (3 * j + 5) % 16;
      } else {
        f = I(b, c, d);
        g = (7 * j) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      b = add(b, rotl(add(add(a, f), add(K[j]!, words[i + g] ?? 0)), S[j]!));
      a = tmp;
    }
    a = add(a, aa);
    b = add(b, bb);
    c = add(c, cc);
    d = add(d, dd);
  }

  const le = (n: number) =>
    [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  return le(a) + le(b) + le(c) + le(d);
}

export type ShaAlgo = "SHA-1" | "SHA-256" | "SHA-512";

export async function shaHex(algo: ShaAlgo, text: string): Promise<string> {
  const digest = await crypto.subtle.digest(algo, textEncoder.encode(text));
  return toHex(new Uint8Array(digest));
}

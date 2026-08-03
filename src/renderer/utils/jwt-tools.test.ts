import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  base64UrlDecode,
  base64UrlEncode,
  formatClaimTime,
  formatRelative,
  parseJwt,
  signJwt,
  tryParseJsonObject,
  verifyJwt,
} from "./jwt-tools.js";

describe("base64Url", () => {
  it("round-trips bytes", () => {
    const raw = new TextEncoder().encode('{"alg":"HS256","typ":"JWT"}');
    const encoded = base64UrlEncode(raw);
    assert.equal(encoded.includes("="), false);
    assert.equal(encoded.includes("+"), false);
    assert.equal(encoded.includes("/"), false);
    assert.deepEqual(base64UrlDecode(encoded), raw);
  });
});

describe("parseJwt", () => {
  it("decodes a known HS256-shaped token without verifying", () => {
    // header {"alg":"HS256","typ":"JWT"} payload {"sub":"123","name":"Ada"}
    const token =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiQWRhIn0.signature";
    const decoded = parseJwt(token);
    assert.equal(decoded.alg, "HS256");
    assert.equal(decoded.payload.sub, "123");
    assert.equal(decoded.payload.name, "Ada");
    assert.equal(decoded.signatureB64u, "signature");
  });

  it("strips Bearer prefix", () => {
    const token =
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig";
    assert.equal(parseJwt(token).payload.sub, "1");
  });

  it("rejects bad shapes", () => {
    assert.throws(() => parseJwt(""), /Empty/);
    assert.throws(() => parseJwt("a.b"), /three parts/);
    assert.throws(() => parseJwt("@@@.@@@.@@@"), /Invalid JWT header/);
  });
});

describe("formatClaimTime / formatRelative", () => {
  it("treats numeric dates as seconds", () => {
    const now = Date.parse("2024-01-15T12:00:00.000Z");
    const info = formatClaimTime(Math.floor(now / 1000) - 90, now);
    assert.ok(info);
    assert.equal(info.isoUtc, "2024-01-15T11:58:30.000Z");
    assert.equal(info.expired, true);
    assert.equal(info.relative, "1m 30s ago");
  });

  it("formats future relative", () => {
    const now = 1_700_000_000_000;
    assert.equal(formatRelative(now + 3_600_000, now), "1h from now");
    assert.equal(formatRelative(now, now), "just now");
  });
});

describe("signJwt / verifyJwt", () => {
  it("signs and verifies HS256", async () => {
    const header = { alg: "HS256", typ: "JWT" };
    const payload = { sub: "user", iat: 1_700_000_000, exp: 1_700_003_600 };
    const secret = "test-secret";
    const token = await signJwt(header, payload, secret);
    const parts = token.split(".");
    assert.equal(parts.length, 3);

    const ok = await verifyJwt(token, secret, { nowMs: 1_700_000_500_000, checkTime: true });
    assert.equal(ok.signatureValid, true);
    assert.equal(ok.expired, false);
    assert.equal(ok.alg, "HS256");

    const bad = await verifyJwt(token, "wrong-secret", { checkTime: false });
    assert.equal(bad.signatureValid, false);
  });

  it("flags expired tokens", async () => {
    const token = await signJwt(
      { alg: "HS256", typ: "JWT" },
      { sub: "x", exp: 1_600_000_000 },
      "secret",
    );
    const r = await verifyJwt(token, "secret", { nowMs: 1_700_000_000_000 });
    assert.equal(r.signatureValid, true);
    assert.equal(r.expired, true);
  });
});

describe("tryParseJsonObject", () => {
  it("parses objects only", () => {
    assert.deepEqual(tryParseJsonObject('{"a":1}'), { a: 1 });
    assert.equal(tryParseJsonObject("[1]"), null);
    assert.equal(tryParseJsonObject("nope"), null);
  });
});

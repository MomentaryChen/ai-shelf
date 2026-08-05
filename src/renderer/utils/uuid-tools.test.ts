import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampIdCount,
  clampNanoidSize,
  generateNanoid,
  generateNanoids,
  generateUuid,
  generateUuidV4,
  generateUuidV7,
  generateUuids,
  isValidUuid,
  NANOID_ALPHABETS,
  parseUuid,
} from "./uuid-tools.js";

describe("generateUuidV4", () => {
  it("returns RFC 4122 v4 shape", () => {
    const id = generateUuidV4();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });
});

describe("generateUuidV7", () => {
  it("embeds millisecond timestamp and version 7", () => {
    const now = Date.parse("2024-04-05T12:00:00.000Z");
    const id = generateUuidV7(now);
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);

    const hex = id.replace(/-/gu, "");
    const ms = Number.parseInt(hex.slice(0, 12), 16);
    assert.equal(ms, now);
  });
});

describe("generateUuids", () => {
  it("clamps count and supports uppercase", () => {
    const ids = generateUuids(4, 3, { uppercase: true });
    assert.equal(ids.length, 3);
    for (const id of ids) {
      assert.equal(id, id.toUpperCase());
      assert.equal(generateUuid(4).length, 36);
    }
  });
});

describe("generateNanoid", () => {
  it("uses default size and url alphabet", () => {
    const id = generateNanoid();
    assert.equal(id.length, 21);
    assert.match(id, /^[A-Za-z0-9_-]+$/u);
  });

  it("respects custom size and alphabet", () => {
    const id = generateNanoid(8, NANOID_ALPHABETS.numbers);
    assert.equal(id.length, 8);
    assert.match(id, /^\d{8}$/u);
  });

  it("rejects tiny alphabets", () => {
    assert.throws(() => generateNanoid(5, "a"), /Alphabet/);
  });
});

describe("generateNanoids", () => {
  it("returns the requested count", () => {
    assert.equal(generateNanoids(5, 10).length, 5);
  });
});

describe("parseUuid / isValidUuid", () => {
  it("accepts canonical and compact forms", () => {
    const a = parseUuid("550e8400-e29b-41d4-a716-446655440000");
    assert.equal(a.ok, true);
    if (a.ok) {
      assert.equal(a.version, 4);
      assert.equal(a.variant, "rfc4122");
      assert.equal(a.canonical, "550e8400-e29b-41d4-a716-446655440000");
    }

    const b = parseUuid("{550E8400E29B41D4A716446655440000}");
    assert.equal(b.ok, true);
    if (b.ok) assert.equal(b.canonical, "550e8400-e29b-41d4-a716-446655440000");

    assert.equal(isValidUuid("urn:uuid:550e8400-e29b-41d4-a716-446655440000"), true);
  });

  it("rejects empty and garbage", () => {
    assert.deepEqual(parseUuid("  "), { ok: false, reason: "empty" });
    assert.deepEqual(parseUuid("not-a-uuid"), { ok: false, reason: "invalid" });
  });
});

describe("clamps", () => {
  it("bounds count and size", () => {
    assert.equal(clampIdCount(0), 1);
    assert.equal(clampIdCount(999), 100);
    assert.equal(clampNanoidSize(0), 1);
    assert.equal(clampNanoidSize(200), 64);
  });
});

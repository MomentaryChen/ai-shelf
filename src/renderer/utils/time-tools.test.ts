import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRelative,
  formatTimeFormats,
  inferUnixUnit,
  parseTimeInput,
} from "./time-tools.js";

describe("inferUnixUnit", () => {
  it("classifies by magnitude", () => {
    assert.equal(inferUnixUnit(1_712_345_678), "s");
    assert.equal(inferUnixUnit(1_712_345_678_000), "ms");
    assert.equal(inferUnixUnit(1_712_345_678_000_000), "us");
    assert.equal(inferUnixUnit(1_712_345_678_000_000_000), "ns");
  });
});

describe("parseTimeInput", () => {
  const nowMs = 1_700_000_000_000;

  it("parses now", () => {
    const r = parseTimeInput("now", { nowMs });
    assert.deepEqual(r, { epochMs: nowMs, unit: "now", inferred: false });
  });

  it("infers seconds / ms / us", () => {
    assert.equal(parseTimeInput("1712345678")?.unit, "s");
    assert.equal(parseTimeInput("1712345678000")?.unit, "ms");
    assert.equal(parseTimeInput("1712345678000000")?.unit, "us");
  });

  it("honors unit suffixes", () => {
    const s = parseTimeInput("1712345678s");
    assert.equal(s?.unit, "s");
    assert.equal(s?.inferred, false);
    assert.equal(s?.epochMs, 1712345678 * 1000);

    const us = parseTimeInput("1712345678000000 us");
    assert.equal(us?.unit, "us");
    assert.equal(us?.epochMs, 1712345678000);
  });

  it("honors forced unit", () => {
    const r = parseTimeInput("1712345678000", { forcedUnit: "s" });
    assert.equal(r?.unit, "s");
    assert.equal(r?.epochMs, 1712345678000 * 1000);
  });

  it("parses ISO timestamps", () => {
    const r = parseTimeInput("2024-01-15T12:00:00.000Z");
    assert.equal(r?.unit, "iso");
    assert.equal(r?.epochMs, Date.parse("2024-01-15T12:00:00.000Z"));
  });

  it("returns null for empty / garbage", () => {
    assert.equal(parseTimeInput(""), null);
    assert.equal(parseTimeInput("not-a-time"), null);
  });
});

describe("formatRelative", () => {
  it("formats past and future", () => {
    const now = 1_700_000_000_000;
    assert.equal(formatRelative(now - 90_000, now), "1m 30s ago");
    assert.equal(formatRelative(now + 3_600_000, now), "1h from now");
    assert.equal(formatRelative(now, now), "just now");
  });
});

describe("formatTimeFormats", () => {
  it("emits UTC and unix variants", () => {
    const epochMs = Date.parse("2024-01-15T12:00:00.000Z");
    const f = formatTimeFormats(epochMs, { timeZone: "UTC", nowMs: epochMs });
    assert.equal(f.isoUtc, "2024-01-15T12:00:00.000Z");
    assert.equal(f.unixSeconds, "1705320000");
    assert.equal(f.unixMillis, "1705320000000");
    assert.equal(f.zoneDate, "2024-01-15");
    assert.equal(f.zoneTime.startsWith("12:00:00"), true);
    assert.equal(f.relative, "just now");
  });
});

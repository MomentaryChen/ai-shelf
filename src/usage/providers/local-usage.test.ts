import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { epochToMs, parseTimestampMs, summarizeLocalUsage, toNumber, windowStartMs } from "./local-usage.js";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");

describe("numeric helpers", () => {
  it("coerces numbers, bigints and numeric strings; rejects junk and negatives", () => {
    assert.equal(toNumber(12), 12);
    assert.equal(toNumber(12n), 12);
    assert.equal(toNumber("0.25"), 0.25);
    assert.equal(toNumber(null), 0);
    assert.equal(toNumber("abc"), 0);
    assert.equal(toNumber(-3), 0);
  });

  it("normalizes epoch seconds and milliseconds", () => {
    assert.equal(epochToMs(1_760_000_000), 1_760_000_000_000);
    assert.equal(epochToMs(1_760_000_000_123), 1_760_000_000_123);
    assert.equal(epochToMs(0), 0);
  });

  it("parses SQLite CURRENT_TIMESTAMP text as UTC and RFC 3339 with zone", () => {
    assert.equal(parseTimestampMs("2026-10-15 08:30:00"), Date.parse("2026-10-15T08:30:00Z"));
    assert.equal(parseTimestampMs("2026-10-15T08:30:00+02:00"), Date.parse("2026-10-15T06:30:00Z"));
    assert.equal(parseTimestampMs("1760000000"), 1_760_000_000_000);
    assert.equal(parseTimestampMs("not a date"), 0);
    assert.equal(parseTimestampMs(undefined), 0);
  });
});

describe("windowStartMs", () => {
  it("starts at UTC midnight days-1 ago", () => {
    assert.equal(new Date(windowStartMs(1, NOW)).toISOString(), "2026-10-16T00:00:00.000Z");
    assert.equal(new Date(windowStartMs(7, NOW)).toISOString(), "2026-10-10T00:00:00.000Z");
  });
});

describe("summarizeLocalUsage", () => {
  it("buckets by UTC day, totals by model, and drops out-of-window or empty records", () => {
    const result = summarizeLocalUsage(
      [
        { timestampMs: Date.parse("2026-10-16T01:00:00Z"), costUsd: 0.5, inputTokens: 100, outputTokens: 10, model: "a" },
        { timestampMs: Date.parse("2026-10-16T09:00:00Z"), costUsd: 0.25, inputTokens: 50, outputTokens: 5, model: "b" },
        { timestampMs: Date.parse("2026-10-14T09:00:00Z"), costUsd: 1, inputTokens: 10, outputTokens: 1, model: "a" },
        { timestampMs: Date.parse("2026-09-01T09:00:00Z"), costUsd: 9, inputTokens: 9, outputTokens: 9, model: "a" },
        { timestampMs: Date.parse("2026-10-15T09:00:00Z"), costUsd: 0, inputTokens: 0, outputTokens: 0, model: "a" },
        { timestampMs: Date.parse("2026-10-15T10:00:00Z"), costUsd: 0, inputTokens: 7, outputTokens: 3 },
      ],
      7,
      NOW,
    );

    assert.deepEqual(
      result.daily.map((d) => [d.date, d.costUsd, d.inputTokens, d.outputTokens]),
      [
        ["2026-10-14", 1, 10, 1],
        ["2026-10-15", 0, 7, 3],
        ["2026-10-16", 0.75, 150, 15],
      ],
    );
    assert.equal(result.totalCostUsd, 1.75);
    assert.equal(result.totalInputTokens, 167);
    assert.equal(result.totalOutputTokens, 19);
    assert.deepEqual(
      result.byModel?.map((m) => [m.model, m.costUsd]),
      [
        ["a", 1.5],
        ["b", 0.25],
        ["unknown", 0],
      ],
    );
  });

  it("returns empty totals when nothing is in range", () => {
    const result = summarizeLocalUsage([], 30, NOW);
    assert.deepEqual(result.daily, []);
    assert.equal(result.totalCostUsd, 0);
  });
});

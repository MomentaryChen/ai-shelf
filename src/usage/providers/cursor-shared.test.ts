import assert from "node:assert/strict";
import { describe, it } from "node:test";

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);
}
import {
  aggregateCursorEvents,
  eventCostUsd,
  eventTimestampMs,
  fillCursorCostsFromAggregation,
  type CursorUsageEvent,
} from "./cursor-shared.js";

describe("eventCostUsd", () => {
  it("reads numeric charged cents", () => {
    assert.equal(eventCostUsd({ chargedCents: 124.73 }), 1.2473);
  });

  it("reads charged cents sent as a string", () => {
    assert.equal(eventCostUsd({ chargedCents: "124.50" }), 1.245);
  });

  it("does not let a zero chargedCents hide totalCents plus the token fee", () => {
    closeTo(
      eventCostUsd({
        chargedCents: 0,
        cursorTokenFee: 3.32,
        tokenUsage: { totalCents: 121.41 },
      }),
      1.2473,
    );
  });

  it("reads a formatted usageBasedCosts dollar string when cents are zero", () => {
    assert.equal(eventCostUsd({ chargedCents: 0, usageBasedCosts: "$1.21" }), 1.21);
    assert.equal(eventCostUsd({ chargedCents: "0", usageBasedCosts: "Included" }), 0);
    assert.equal(eventCostUsd({ usageBasedCosts: "$0.00" }), 0);
  });
});

describe("event timestamps", () => {
  it("accepts epoch milliseconds as a string", () => {
    const ts = "1775418973898";
    const ev: CursorUsageEvent = {
      timestamp: ts,
      model: "composer-2",
      chargedCents: "250",
      tokenUsage: { inputTokens: "10", outputTokens: "4" },
    };
    assert.equal(eventTimestampMs(ev), 1775418973898);
    const usage = aggregateCursorEvents([ev]);
    assert.equal(usage.daily.length, 1);
    assert.equal(usage.daily[0]?.date, new Date(1775418973898).toISOString().slice(0, 10));
    assert.equal(usage.totalCostUsd, 2.5);
    assert.equal(usage.totalInputTokens, 10);
    assert.equal(usage.totalOutputTokens, 4);
    assert.equal(usage.byModel[0]?.model, "composer-2");
  });

  it("accepts ISO timestamps and still counts tokens when the charge is zero", () => {
    const usage = aggregateCursorEvents([
      {
        timestamp: "2026-11-03T15:04:05.000Z",
        model: "auto",
        chargedCents: 0,
        tokenUsage: { inputTokens: 100, outputTokens: 20 },
      },
    ]);
    assert.equal(usage.daily[0]?.date, "2026-11-03");
    assert.equal(usage.totalCostUsd, 0);
    assert.equal(usage.totalInputTokens, 100);
    assert.equal(usage.totalOutputTokens, 20);
  });
});

describe("fillCursorCostsFromAggregation", () => {
  const empty = {
    daily: [
      { date: "2026-11-01", costUsd: 0, inputTokens: 10, outputTokens: 0 },
      { date: "2026-11-04", costUsd: 0, inputTokens: 30, outputTokens: 0 },
    ],
    byModel: [{ model: "from-events", costUsd: 0, inputTokens: 40 }],
    totalCostUsd: 0,
    totalInputTokens: 40,
    totalOutputTokens: 0,
  };

  it("splits aggregated cents across days by tokens and uses model totals", () => {
    const filled = fillCursorCostsFromAggregation(
      empty,
      {
        totalCostCents: 1000,
        aggregations: [
          { modelIntent: "composer-2", inputTokens: "40", outputTokens: "0", totalCents: 1000 },
        ],
      },
      null,
    );
    assert.equal(filled.totalCostUsd, 10);
    assert.equal(filled.daily[0]?.costUsd, 2.5);
    assert.equal(filled.daily[1]?.costUsd, 7.5);
    assert.equal(filled.byModel[0]?.model, "composer-2");
    assert.equal(filled.byModel[0]?.costUsd, 10);
  });

  it("fits the last-7-days slice to the week aggregate", () => {
    const filled = fillCursorCostsFromAggregation(
      empty,
      { totalCostCents: 2000 },
      {
        costUsd: 4,
        startDate: "2026-11-03",
        endDate: "2026-11-05",
      },
    );
    assert.equal(filled.totalCostUsd, 20);
    assert.equal(filled.daily[0]?.costUsd, 16);
    assert.equal(filled.daily[1]?.costUsd, 4);
    assert.equal(filled.weekCostUsd, 4);
  });

  it("keeps measured per-event dollars", () => {
    const measured = { ...empty, totalCostUsd: 3.5, daily: [{ ...empty.daily[0]!, costUsd: 3.5 }] };
    const filled = fillCursorCostsFromAggregation(
      measured,
      { totalCostCents: 99999 },
      {
        costUsd: 50,
        startDate: "2026-11-01",
        endDate: "2026-11-05",
      },
    );
    assert.equal(filled.totalCostUsd, 3.5);
    assert.equal(filled.weekCostUsd, undefined);
  });

  it("keeps a measured week total when the period aggregate is empty", () => {
    const filled = fillCursorCostsFromAggregation(empty, null, {
      costUsd: 6,
      startDate: "2026-11-01",
      endDate: "2026-11-05",
    });
    assert.equal(filled.totalCostUsd, 0);
    assert.equal(filled.weekCostUsd, 6);
    assert.equal(filled.daily[0]?.costUsd, 0);
  });
});

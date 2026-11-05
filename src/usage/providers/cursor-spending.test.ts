import assert from "node:assert/strict";
import { describe, it } from "node:test";

function closeTo(actual: number | undefined, expected: number) {
  assert.equal(typeof actual, "number");
  assert.ok(Math.abs((actual ?? 0) - expected) < 1e-9, `${actual} ≉ ${expected}`);
}
import {
  cursorCycleTimestampToIso,
  quotasFromCurrentPeriodUsage,
  quotasFromUsageSummary,
} from "./cursor-spending.js";

describe("quotasFromUsageSummary", () => {
  it("treats plan used, limit, and remaining as cents on the same row", () => {
    const quotas = quotasFromUsageSummary({
      billingCycleEnd: "2026-12-01T00:00:00.000Z",
      individualUsage: {
        plan: {
          enabled: true,
          used: 450,
          limit: 2000,
          remaining: 1550,
          totalPercentUsed: 22.5,
          apiPercentUsed: 10,
        },
      },
    });

    const total = quotas.find((q) => q.key === "cursor-total");
    assert.ok(total);
    assert.equal(total.usedUsd, 4.5);
    assert.equal(total.limitUsd, 20);
    assert.equal(total.remainingUsd, 15.5);
    assert.equal(total.usedPercent, 23);

    const api = quotas.find((q) => q.key === "cursor-api");
    assert.ok(api);
    assert.equal(api.usedPercent, 10);
    assert.equal(api.usedUsd, undefined);
    assert.equal(api.limitUsd, undefined);
    assert.equal(api.remainingUsd, undefined);
  });
});

describe("quotasFromCurrentPeriodUsage", () => {
  it("shows included spend in dollars separate from auto and api percents", () => {
    const quotas = quotasFromCurrentPeriodUsage({
      billingCycleEnd: "1785957659000",
      planUsage: {
        totalSpend: 1529,
        limit: 2000,
        totalPercentUsed: 10.19,
        apiPercentUsed: 3.16,
        autoPercentUsed: 13.21,
      },
      spendLimitUsage: {
        individualLimit: 5000,
        individualRemaining: 2700,
      },
    });

    const spend = quotas.find((q) => q.key === "cursor-plan-spend");
    assert.ok(spend);
    closeTo(spend.usedUsd, 15.29);
    assert.equal(spend.limitUsd, 20);
    closeTo(spend.remainingUsd, 4.71);
    assert.equal(spend.usedPercent, 76);
    assert.equal(spend.resetAt, new Date(1785957659000).toISOString());

    const api = quotas.find((q) => q.key === "cursor-period-api");
    assert.ok(api);
    assert.equal(api.usedPercent, 3);
    assert.equal(api.limitUsd, undefined);

    const onDemand = quotas.find((q) => q.key === "cursor-on-demand");
    assert.ok(onDemand);
    assert.equal(onDemand.usedUsd, 23);
    assert.equal(onDemand.limitUsd, 50);
    assert.equal(onDemand.remainingUsd, 27);
  });

  it("returns nothing when the period payload is only zero percents", () => {
    assert.deepEqual(
      quotasFromCurrentPeriodUsage({
        planUsage: { totalPercentUsed: 0, apiPercentUsed: 0, autoPercentUsed: 0 },
      }),
      [],
    );
  });

  it("parses second-epoch cycle bounds", () => {
    assert.equal(cursorCycleTimestampToIso(1785957659), new Date(1785957659000).toISOString());
  });
});

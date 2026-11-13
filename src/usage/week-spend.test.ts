import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weekSpendUsdFromTools } from "./attribution.js";
import type { UsageToolSnapshot } from "./types.js";

const week = {
  startMs: Date.parse("2026-11-01T00:00:00.000Z"),
  endMs: Date.parse("2026-11-07T23:59:59.999Z"),
};

function tool(
  partial: Partial<UsageToolSnapshot> & Pick<UsageToolSnapshot, "toolId">,
): UsageToolSnapshot {
  return {
    label: partial.toolId,
    status: "ok",
    daily: [],
    ...partial,
  };
}

describe("weekSpendUsdFromTools", () => {
  it("uses a provider week total when daily rows have no dollars", () => {
    const spend = weekSpendUsdFromTools(
      [
        tool({
          toolId: "cursor",
          weekCostUsd: 12,
          daily: [{ date: "2026-11-04", costUsd: 0, inputTokens: 100 }],
        }),
        tool({
          toolId: "claude",
          daily: [{ date: "2026-11-04", costUsd: 3, inputTokens: 10 }],
        }),
      ],
      week,
    );
    assert.equal(spend, 15);
  });

  it("prefers the measured week total over daily dollars for that tool", () => {
    const spend = weekSpendUsdFromTools(
      [
        tool({
          toolId: "cursor",
          weekCostUsd: 4,
          totalCostUsd: 20,
          daily: [{ date: "2026-11-04", costUsd: 9 }],
        }),
      ],
      week,
    );
    assert.equal(spend, 4);
  });

  it("ignores daily cost outside the week", () => {
    const spend = weekSpendUsdFromTools(
      [
        tool({
          toolId: "claude",
          daily: [
            { date: "2026-10-20", costUsd: 40 },
            { date: "2026-11-02", costUsd: 2 },
          ],
        }),
      ],
      week,
    );
    assert.equal(spend, 2);
  });
});

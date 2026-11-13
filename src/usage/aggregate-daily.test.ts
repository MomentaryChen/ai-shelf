import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateUsageDashboard } from "./aggregate-daily.js";
import { buildAttributionInsights } from "./attribution.js";
import type { UsageToolSnapshot } from "./types.js";

function snap(partial: Partial<UsageToolSnapshot> & Pick<UsageToolSnapshot, "toolId" | "status">): UsageToolSnapshot {
  return { label: partial.toolId, daily: [], ...partial };
}

test("period total excludes billing-cycle spend and reports it separately", () => {
  const summary = aggregateUsageDashboard([
    snap({
      toolId: "codex",
      status: "ok",
      totalCostUsd: 12,
      daily: [{ date: "2026-11-10", costUsd: 12 }],
    }),
    snap({
      toolId: "claude",
      status: "ok",
      totalCostUsd: 40,
      costScope: "billingCycle",
      quotas: [{ key: "five_hour", labelKey: "x", usedPercent: 10 }],
    }),
  ]);
  assert.equal(summary.totalCostUsd, 12);
  assert.equal(summary.billingCycleCostUsd, 40);
});

test("connected counts API and local tools; supported excludes unsupported", () => {
  const summary = aggregateUsageDashboard([
    snap({ toolId: "claude", status: "ok", totalCostUsd: 1 }),
    snap({ toolId: "codex", status: "error", error: "401" }),
    snap({ toolId: "cursor", status: "not_configured" }),
    snap({ toolId: "opencode", status: "ok" }),
    snap({ toolId: "crush", status: "not_configured", messageKey: "usage.local.notFound" }),
    snap({ toolId: "aider", status: "unsupported" }),
  ]);
  assert.equal(summary.configuredCount, 3);
  assert.equal(summary.supportedCount, 5);
});

test("reporting requires cost, tokens or quotas in the period", () => {
  const summary = aggregateUsageDashboard([
    // local DB found but no sessions in range
    snap({ toolId: "opencode", status: "ok", totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0 }),
    // tokens only (included usage)
    snap({ toolId: "goose", status: "ok", totalInputTokens: 500 }),
    // quota snapshot only
    snap({ toolId: "gemini", status: "ok", totalCostUsd: 0, quotas: [{ key: "rpd", labelKey: "x", usedPercent: 3 }] }),
    snap({ toolId: "codex", status: "error" }),
  ]);
  assert.equal(summary.activeCount, 2);
});

test("attribution excludes billing-cycle spend from period tool totals", () => {
  const tools: UsageToolSnapshot[] = [
    snap({ toolId: "claude", status: "ok", totalCostUsd: 40, costScope: "billingCycle" }),
    snap({ toolId: "codex", status: "ok", totalCostUsd: 10 }),
  ];
  const insights = buildAttributionInsights(tools);
  assert.equal(insights.byTool.find((r) => r.id === "claude"), undefined);
  assert.equal(insights.byTool.find((r) => r.id === "codex")?.costUsd, 10);
});

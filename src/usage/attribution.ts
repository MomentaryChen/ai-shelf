import type {
  UsageAttributionRow,
  UsageBudgetAlert,
  UsageBudgetPrefs,
  UsageCostInsights,
  UsageToolId,
  UsageToolSnapshot,
} from "./types.js";

/**
 * Tool spend for the selected period. Billing-cycle totals (claude.ai extra-usage
 * credits) cover a different window, so they are not split across period runs.
 */
function periodToolCostUsd(tool: UsageToolSnapshot): number {
  if (tool.costScope === "billingCycle") return 0;
  return tool.totalCostUsd ?? 0;
}

type MutableRow = {
  id: string;
  label: string;
  costUsd: number;
  runCount: number;
  measuredCostUsd: number;
  estimatedCostUsd: number;
  durationMs: number;
  toolId?: UsageToolId;
};

function finalizeRows(map: Map<string, MutableRow>, limit = 12): UsageAttributionRow[] {
  return [...map.values()]
    .map((row) => ({
      id: row.id,
      label: row.label,
      costUsd: row.costUsd,
      runCount: row.runCount,
      estimated: row.estimatedCostUsd > 0 && row.measuredCostUsd <= 0,
      toolId: row.toolId,
      durationMs: row.durationMs,
    }))
    .sort(
      (a, b) =>
        b.costUsd - a.costUsd ||
        b.runCount - a.runCount ||
        b.durationMs - a.durationMs ||
        a.label.localeCompare(b.label),
    )
    .slice(0, limit);
}

/** Provider spend per tool for the selected period. */
export function buildAttributionInsights(
  tools: UsageToolSnapshot[],
): Pick<UsageCostInsights, "byTool"> {
  const byToolMap = new Map<string, MutableRow>();

  for (const tool of tools) {
    if (tool.status !== "ok") continue;
    const cost = periodToolCostUsd(tool);
    if (cost <= 0 && (tool.totalInputTokens ?? 0) <= 0) continue;
    byToolMap.set(tool.toolId, {
      id: tool.toolId,
      label: tool.label,
      costUsd: cost,
      runCount: 0,
      measuredCostUsd: cost,
      estimatedCostUsd: 0,
      durationMs: 0,
      toolId: tool.toolId,
    });
  }

  return {
    byTool: finalizeRows(byToolMap),
    // Profile attribution was derived from AI Flow runs; nothing feeds it any more.
  };
}

export function evaluateBudgetAlert(
  weekSpendUsd: number,
  prefs: UsageBudgetPrefs,
  providerQuotas: Array<{
    labelKey: string;
    label?: string;
    usedPercent: number;
    toolId: UsageToolId;
  }>,
): UsageBudgetAlert {
  const budget = prefs.weeklyBudgetUsd;
  const alertAt = prefs.alertAtPercent;
  let level: UsageBudgetAlert["level"] = "ok";
  let usedPercent = 0;
  let messageKey: UsageBudgetAlert["messageKey"] = "usage.budget.ok";

  if (budget != null && budget > 0) {
    usedPercent = (weekSpendUsd / budget) * 100;
    if (weekSpendUsd >= budget) {
      level = "over";
      messageKey = "usage.budget.over";
    } else if (usedPercent >= alertAt) {
      level = "warn";
      messageKey = "usage.budget.warn";
    }
  }

  const quotaAlerts = providerQuotas
    .filter((q) => q.usedPercent >= alertAt)
    .sort((a, b) => b.usedPercent - a.usedPercent)
    .slice(0, 3);

  if (level === "ok" && quotaAlerts.length > 0) {
    level = quotaAlerts[0]!.usedPercent >= 100 ? "over" : "warn";
    messageKey = "usage.budget.quotaWarn";
  }

  return {
    level,
    weekSpendUsd,
    weeklyBudgetUsd: budget,
    alertAtPercent: alertAt,
    usedPercent: budget != null && budget > 0 ? Math.min(999, Math.round(usedPercent)) : 0,
    messageKey,
    quotaAlerts,
  };
}

export function weekWindowMs(now = Date.now()): { startMs: number; endMs: number } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function collectProviderQuotaAlerts(
  tools: UsageToolSnapshot[],
): Array<{ labelKey: string; label?: string; usedPercent: number; toolId: UsageToolId }> {
  const out: Array<{ labelKey: string; label?: string; usedPercent: number; toolId: UsageToolId }> =
    [];
  for (const tool of tools) {
    if (tool.status !== "ok" || !tool.quotas) continue;
    for (const q of tool.quotas) {
      out.push({
        toolId: tool.toolId,
        labelKey: q.labelKey,
        label: q.label,
        usedPercent: q.usedPercent,
      });
    }
  }
  return out;
}

function dailyCostInWindow(tool: UsageToolSnapshot, startMs: number, endMs: number): number {
  return tool.daily
    .filter((d) => {
      const ms = Date.parse(`${d.date}T12:00:00.000Z`);
      return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
    })
    .reduce((sum, d) => sum + d.costUsd, 0);
}

/**
 * Week spend for the decision card.
 * A tool may publish `weekCostUsd` when its daily rows have tokens but the provider
 * no longer puts dollars on each event (Cursor included usage). That measured week
 * total wins over a token-weighted split of the longer range.
 */
export function weekSpendUsdFromTools(
  tools: UsageToolSnapshot[],
  week: { startMs: number; endMs: number },
): number {
  return tools
    .filter((t) => t.status === "ok")
    .reduce((sum, tool) => {
      if (tool.weekCostUsd != null && tool.weekCostUsd > 0) return sum + tool.weekCostUsd;
      return sum + dailyCostInWindow(tool, week.startMs, week.endMs);
    }, 0);
}

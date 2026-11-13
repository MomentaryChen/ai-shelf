import type { UsageDailyUnifiedRow, UsageDayBucket, UsageToolId, UsageToolSnapshot } from "./types.js";

export interface UsageDashboardSummary {
  totalCostUsd: number;
  billingCycleCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  configuredCount: number;
  supportedCount: number;
  activeCount: number;
  dailyUnified: UsageDailyUnifiedRow[];
}

/**
 * Connected = the tool has a usage source: saved API credentials, or local session
 * data on disk. A fetch error still counts — the source exists, it just failed.
 */
export function isUsageToolConnected(tool: UsageToolSnapshot): boolean {
  return tool.status === "ok" || tool.status === "error";
}

/**
 * Reporting = a connected tool returned something for this period: cost, tokens,
 * or a quota snapshot. A local database with no sessions in range does not count.
 */
export function isUsageToolReporting(tool: UsageToolSnapshot): boolean {
  if (tool.status !== "ok") return false;
  if ((tool.totalCostUsd ?? 0) > 0) return true;
  if ((tool.totalInputTokens ?? 0) > 0 || (tool.totalOutputTokens ?? 0) > 0) return true;
  if ((tool.quotas?.length ?? 0) > 0) return true;
  return tool.daily.some(
    (d) => d.costUsd > 0 || (d.inputTokens ?? 0) > 0 || (d.outputTokens ?? 0) > 0,
  );
}

function isBillingCycleCost(tool: UsageToolSnapshot): boolean {
  return tool.costScope === "billingCycle";
}

function mergeDayBucket(
  row: UsageDailyUnifiedRow,
  toolId: UsageToolId,
  bucket: UsageDayBucket,
): void {
  row.costUsd += bucket.costUsd;
  row.inputTokens = (row.inputTokens ?? 0) + (bucket.inputTokens ?? 0);
  row.outputTokens = (row.outputTokens ?? 0) + (bucket.outputTokens ?? 0);

  const tool = row.byTool[toolId] ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 };
  tool.costUsd += bucket.costUsd;
  tool.inputTokens = (tool.inputTokens ?? 0) + (bucket.inputTokens ?? 0);
  tool.outputTokens = (tool.outputTokens ?? 0) + (bucket.outputTokens ?? 0);
  row.byTool[toolId] = tool;
}

export function aggregateUsageDashboard(tools: UsageToolSnapshot[]): UsageDashboardSummary {
  const okTools = tools.filter((t) => t.status === "ok");
  const byDate = new Map<string, UsageDailyUnifiedRow>();

  for (const tool of okTools) {
    for (const bucket of tool.daily) {
      const existing = byDate.get(bucket.date) ?? {
        date: bucket.date,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        byTool: {},
      };
      mergeDayBucket(existing, tool.toolId, bucket);
      byDate.set(bucket.date, existing);
    }
  }

  const dailyUnified = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const sumCost = (list: UsageToolSnapshot[]) =>
    list.reduce((sum, t) => sum + (t.totalCostUsd ?? 0), 0);

  return {
    totalCostUsd: sumCost(okTools.filter((t) => !isBillingCycleCost(t))),
    billingCycleCostUsd: sumCost(okTools.filter(isBillingCycleCost)),
    totalInputTokens: okTools.reduce((sum, t) => sum + (t.totalInputTokens ?? 0), 0),
    totalOutputTokens: okTools.reduce((sum, t) => sum + (t.totalOutputTokens ?? 0), 0),
    configuredCount: tools.filter(isUsageToolConnected).length,
    supportedCount: tools.filter((t) => t.status !== "unsupported").length,
    activeCount: tools.filter(isUsageToolReporting).length,
    dailyUnified,
  };
}

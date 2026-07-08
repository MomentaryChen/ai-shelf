import type { UsageDailyUnifiedRow, UsageDayBucket, UsageToolId, UsageToolSnapshot } from "./types.js";

export interface UsageDashboardSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  configuredCount: number;
  supportedCount: number;
  dailyUnified: UsageDailyUnifiedRow[];
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

export function aggregateUsageDashboard(
  tools: UsageToolSnapshot[],
  configuredCount: number,
  supportedCount: number,
): UsageDashboardSummary {
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

  return {
    totalCostUsd: okTools.reduce((sum, t) => sum + (t.totalCostUsd ?? 0), 0),
    totalInputTokens: okTools.reduce((sum, t) => sum + (t.totalInputTokens ?? 0), 0),
    totalOutputTokens: okTools.reduce((sum, t) => sum + (t.totalOutputTokens ?? 0), 0),
    configuredCount,
    supportedCount,
    dailyUnified,
  };
}

import type { UsageDayBucket, UsageModelBreakdown } from "../types.js";

export interface CursorTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCents?: number;
}

export interface CursorUsageEvent {
  timestamp?: string;
  model?: string;
  chargedCents?: number;
  tokenUsage?: CursorTokenUsage;
}

export function tokenInputTotal(usage?: CursorTokenUsage): number {
  if (!usage) return 0;
  return (
    Number(usage.inputTokens ?? 0) +
    Number(usage.cacheWriteTokens ?? 0) +
    Number(usage.cacheReadTokens ?? 0)
  );
}

export function eventCostUsd(ev: CursorUsageEvent): number {
  if (ev.chargedCents != null && Number.isFinite(ev.chargedCents)) {
    return Number(ev.chargedCents) / 100;
  }
  const totalCents = ev.tokenUsage?.totalCents;
  if (totalCents != null && Number.isFinite(totalCents)) {
    return Number(totalCents) / 100;
  }
  return 0;
}

/** Cursor APIs allow at most ~30 days per request — chunk longer ranges. */
export function chunkDateRanges(days: number): Array<{ startDate: number; endDate: number }> {
  const chunks: Array<{ startDate: number; endDate: number }> = [];
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  let cursorEnd = end.getTime();
  let remaining = Math.min(Math.max(days, 1), 90);

  while (remaining > 0) {
    const span = Math.min(remaining, 30);
    const start = new Date(cursorEnd);
    start.setUTCDate(start.getUTCDate() - span + 1);
    start.setUTCHours(0, 0, 0, 0);
    chunks.unshift({ startDate: start.getTime(), endDate: cursorEnd });
    cursorEnd = start.getTime() - 1;
    remaining -= span;
  }

  return chunks;
}

export function aggregateCursorEvents(events: CursorUsageEvent[]): {
  daily: UsageDayBucket[];
  byModel: UsageModelBreakdown[];
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
} {
  const dailyMap = new Map<string, { costUsd: number; input: number; output: number }>();
  const modelMap = new Map<string, { costUsd: number; input: number; output: number }>();

  for (const ev of events) {
    const ts = Number(ev.timestamp ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const date = new Date(ts).toISOString().slice(0, 10);
    const costUsd = eventCostUsd(ev);
    const input = tokenInputTotal(ev.tokenUsage);
    const output = Number(ev.tokenUsage?.outputTokens ?? 0);

    const day = dailyMap.get(date) ?? { costUsd: 0, input: 0, output: 0 };
    day.costUsd += costUsd;
    day.input += input;
    day.output += output;
    dailyMap.set(date, day);

    const model = ev.model?.trim() || "unknown";
    const modelRow = modelMap.get(model) ?? { costUsd: 0, input: 0, output: 0 };
    modelRow.costUsd += costUsd;
    modelRow.input += input;
    modelRow.output += output;
    modelMap.set(model, modelRow);
  }

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      costUsd: row.costUsd,
      inputTokens: row.input || undefined,
      outputTokens: row.output || undefined,
    }));

  const byModel = [...modelMap.entries()]
    .map(([model, row]) => ({
      model,
      costUsd: row.costUsd,
      inputTokens: row.input || undefined,
      outputTokens: row.output || undefined,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || (b.inputTokens ?? 0) - (a.inputTokens ?? 0));

  const totalCostUsd = daily.reduce((sum, d) => sum + d.costUsd, 0);
  const totalInputTokens = daily.reduce((sum, d) => sum + (d.inputTokens ?? 0), 0);
  const totalOutputTokens = daily.reduce((sum, d) => sum + (d.outputTokens ?? 0), 0);

  return { daily, byModel, totalCostUsd, totalInputTokens, totalOutputTokens };
}

import type { UsageDayBucket, UsageModelBreakdown } from "../types.js";

export interface CursorTokenUsage {
  inputTokens?: number | string;
  outputTokens?: number | string;
  cacheWriteTokens?: number | string;
  cacheReadTokens?: number | string;
  totalCents?: number | string;
}

export interface CursorUsageEvent {
  timestamp?: string | number;
  model?: string;
  /** Cents. Dashboard responses sometimes send this as a string, or 0 while another field still has the charge. */
  chargedCents?: number | string;
  /** Formatted dollars, e.g. "$1.21". Present on dashboard events when chargedCents is omitted. */
  usageBasedCosts?: number | string;
  /** Cursor Token Rate in cents. Included in chargedCents when that field is non-zero. */
  cursorTokenFee?: number | string;
  tokenUsage?: CursorTokenUsage;
}

export interface CursorModelAggregation {
  modelIntent?: string;
  inputTokens?: number | string;
  outputTokens?: number | string;
  cacheWriteTokens?: number | string;
  cacheReadTokens?: number | string;
  totalCents?: number | string | null;
}

/** Response from `POST /api/dashboard/get-aggregated-usage-events`. */
export interface CursorAggregatedUsage {
  aggregations?: CursorModelAggregation[];
  totalCostCents?: number | string | null;
}

export interface CursorWeekCost {
  costUsd: number;
  startDate: string;
  endDate: string;
}

function finiteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Epoch milliseconds. Accepts ms, seconds, numeric strings, and ISO timestamps. */
export function eventTimestampMs(ev: CursorUsageEvent): number {
  const raw = ev.timestamp;
  if (typeof raw === "number" && Number.isFinite(raw)) return normalizeEpoch(raw);
  if (typeof raw !== "string") return 0;
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return normalizeEpoch(Number(trimmed));
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEpoch(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e12 ? n * 1000 : n;
}

export function tokenInputTotal(usage?: CursorTokenUsage): number {
  if (!usage) return 0;
  return (
    finiteNumber(usage.inputTokens) +
    finiteNumber(usage.cacheWriteTokens) +
    finiteNumber(usage.cacheReadTokens)
  );
}

/** Dollar amount from a dashboard `usageBasedCosts` field (`"$1.21"`, `"Included"`, or a number). */
export function usageBasedCostUsd(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : 0;
  if (typeof value !== "string") return 0;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Per-event dollars.
 * The dashboard zeroes `chargedCents` (and sometimes drops `totalCents`) for included usage,
 * while on-demand rows keep the charge in `usageBasedCosts` or as a numeric string.
 * A literal 0 must not hide a non-zero sibling field.
 */
export function eventCostUsd(ev: CursorUsageEvent): number {
  const charged = finiteOrNull(ev.chargedCents);
  if (charged != null && charged > 0) return charged / 100;

  const model = finiteOrNull(ev.tokenUsage?.totalCents);
  const fee = finiteOrNull(ev.cursorTokenFee);
  if ((model != null && model > 0) || (fee != null && fee > 0)) {
    return ((model ?? 0) + (fee ?? 0)) / 100;
  }

  return usageBasedCostUsd(ev.usageBasedCosts);
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
    const ts = eventTimestampMs(ev);
    if (ts <= 0) continue;
    const date = new Date(ts).toISOString().slice(0, 10);
    const costUsd = eventCostUsd(ev);
    const input = tokenInputTotal(ev.tokenUsage);
    const output = finiteNumber(ev.tokenUsage?.outputTokens);

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

export type CursorUsageRollup = ReturnType<typeof aggregateCursorEvents>;

const COST_EPSILON = 0.000_001;

/** Dollars from an aggregated-usage payload. Prefers `totalCostCents`, else sums model rows. */
export function aggregatedCostUsd(data: CursorAggregatedUsage | null | undefined): number {
  if (!data) return 0;
  const total = finiteOrNull(data.totalCostCents);
  if (total != null && total > 0) return total / 100;
  const sum = (data.aggregations ?? []).reduce(
    (acc, row) => acc + (finiteOrNull(row.totalCents) ?? 0),
    0,
  );
  return sum > 0 ? sum / 100 : 0;
}

function modelsFromAggregation(rows: CursorModelAggregation[]): UsageModelBreakdown[] {
  const map = new Map<string, { costUsd: number; input: number; output: number }>();
  for (const row of rows) {
    const model = row.modelIntent?.trim() || "unknown";
    const input =
      finiteNumber(row.inputTokens) +
      finiteNumber(row.cacheWriteTokens) +
      finiteNumber(row.cacheReadTokens);
    const output = finiteNumber(row.outputTokens);
    const cost = (finiteOrNull(row.totalCents) ?? 0) / 100;
    const prev = map.get(model) ?? { costUsd: 0, input: 0, output: 0 };
    prev.costUsd += cost;
    prev.input += input;
    prev.output += output;
    map.set(model, prev);
  }
  return [...map.entries()]
    .map(([model, row]) => ({
      model,
      costUsd: row.costUsd,
      inputTokens: row.input || undefined,
      outputTokens: row.output || undefined,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || (b.inputTokens ?? 0) - (a.inputTokens ?? 0));
}

function allocateCost(daily: UsageDayBucket[], total: number): UsageDayBucket[] {
  if (daily.length === 0 || total <= 0) return daily.map((d) => ({ ...d, costUsd: 0 }));
  const weights = daily.map((d) => (d.inputTokens ?? 0) + (d.outputTokens ?? 0));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) {
    const share = total / daily.length;
    return daily.map((d) => ({ ...d, costUsd: share }));
  }
  return daily.map((d, i) => ({ ...d, costUsd: (total * (weights.at(i) ?? 0)) / weightSum }));
}

function rescaleDays(
  daily: UsageDayBucket[],
  match: (date: string) => boolean,
  target: number,
): void {
  const indexes = daily.flatMap((d, i) => (match(d.date) ? [i] : []));
  if (indexes.length === 0 || target < 0) return;
  const current = indexes.reduce((sum, i) => sum + (daily.at(i)?.costUsd ?? 0), 0);
  const write = (index: number, costUsd: number) => {
    const row = daily.at(index);
    if (!row) return;
    daily[index] = { ...row, costUsd };
  };
  if (current <= COST_EPSILON) {
    const share = target / indexes.length;
    for (const i of indexes) write(i, share);
    return;
  }
  const factor = target / current;
  for (const i of indexes) write(i, (daily.at(i)?.costUsd ?? 0) * factor);
}

/**
 * When per-event `chargedCents` is zeroed, the aggregated endpoint still returns
 * period and per-model cents. Spread that total across event days by token volume,
 * then fit the last-7-days slice to the week aggregate when it does not exceed the period.
 */
export function fillCursorCostsFromAggregation(
  usage: CursorUsageRollup,
  period: CursorAggregatedUsage | null | undefined,
  week: CursorWeekCost | null,
): CursorUsageRollup & { weekCostUsd?: number } {
  const weekCostUsd = week && week.costUsd > COST_EPSILON ? week.costUsd : undefined;
  if (usage.totalCostUsd > COST_EPSILON) return usage;

  const periodCost = aggregatedCostUsd(period);
  if (periodCost <= COST_EPSILON) {
    return weekCostUsd != null ? { ...usage, weekCostUsd } : usage;
  }

  const aggregatedModels = modelsFromAggregation(period?.aggregations ?? []);
  const byModel = aggregatedModels.some((m) => m.costUsd > 0) ? aggregatedModels : usage.byModel;
  const daily = allocateCost(usage.daily, periodCost);

  if (week && week.costUsd > COST_EPSILON && week.costUsd <= periodCost + 0.01) {
    const inWeek = (date: string) => date >= week.startDate && date <= week.endDate;
    rescaleDays(daily, inWeek, week.costUsd);
    rescaleDays(daily, (date) => !inWeek(date), Math.max(0, periodCost - week.costUsd));
  }

  return {
    ...usage,
    daily,
    byModel,
    totalCostUsd: periodCost,
    weekCostUsd,
  };
}

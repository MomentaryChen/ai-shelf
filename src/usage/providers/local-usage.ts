import type { UsageDayBucket, UsageModelBreakdown, UsageToolSnapshot } from "../types.js";

/** One normalized usage event read from a tool's local session data. */
export interface LocalUsageRecord {
  timestampMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  model?: string;
}

export type LocalUsageResult = Pick<
  UsageToolSnapshot,
  "daily" | "byModel" | "totalCostUsd" | "totalInputTokens" | "totalOutputTokens"
>;

/** Coerce SQLite / JSON numeric values (number, bigint, numeric string) to a finite non-negative number. */
export function toNumber(value: unknown): number {
  const n = typeof value === "bigint" ? Number(value) : typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Normalize an epoch timestamp that may be seconds or milliseconds.
 * Values above 1e11 (~1973 in ms, year 5138 in s) are treated as milliseconds.
 */
export function epochToMs(value: unknown): number {
  const n = toNumber(value);
  if (n <= 0) return 0;
  return n > 1e11 ? n : n * 1000;
}

/**
 * Parse SQLite `CURRENT_TIMESTAMP` / `datetime('now')` text (UTC, no zone) or RFC 3339 text,
 * or an epoch number, into milliseconds. Returns 0 when unparseable.
 */
export function parseTimestampMs(value: unknown): number {
  if (typeof value === "number" || typeof value === "bigint") return epochToMs(value);
  if (typeof value !== "string" || !value.trim()) return 0;
  const raw = value.trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return epochToMs(raw);
  let iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += "Z";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/** Start of the UTC day `days - 1` days ago — same window convention as the API providers. */
export function windowStartMs(days: number, nowMs = Date.now()): number {
  const d = new Date(nowMs);
  d.setUTCDate(d.getUTCDate() - Math.max(days, 1) + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Roll normalized records into daily buckets, per-model totals and period totals. */
export function summarizeLocalUsage(
  records: LocalUsageRecord[],
  days: number,
  nowMs = Date.now(),
): LocalUsageResult {
  const startMs = windowStartMs(days, nowMs);
  const byDate = new Map<string, UsageDayBucket>();
  const byModel = new Map<string, UsageModelBreakdown>();
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const rec of records) {
    if (!Number.isFinite(rec.timestampMs) || rec.timestampMs < startMs || rec.timestampMs > nowMs + 86_400_000) {
      continue;
    }
    if (rec.costUsd <= 0 && rec.inputTokens <= 0 && rec.outputTokens <= 0) continue;

    const date = new Date(rec.timestampMs).toISOString().slice(0, 10);
    const day = byDate.get(date) ?? { date, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    day.costUsd += rec.costUsd;
    day.inputTokens = (day.inputTokens ?? 0) + rec.inputTokens;
    day.outputTokens = (day.outputTokens ?? 0) + rec.outputTokens;
    byDate.set(date, day);

    const modelKey = rec.model?.trim() || "unknown";
    const model = byModel.get(modelKey) ?? { model: modelKey, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    model.costUsd += rec.costUsd;
    model.inputTokens = (model.inputTokens ?? 0) + rec.inputTokens;
    model.outputTokens = (model.outputTokens ?? 0) + rec.outputTokens;
    byModel.set(modelKey, model);

    totalCostUsd += rec.costUsd;
    totalInputTokens += rec.inputTokens;
    totalOutputTokens += rec.outputTokens;
  }

  return {
    daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byModel: [...byModel.values()].sort(
      (a, b) => b.costUsd - a.costUsd || (b.inputTokens ?? 0) - (a.inputTokens ?? 0),
    ),
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
  };
}

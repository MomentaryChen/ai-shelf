import type { UsageQuotaWindow, UsageToolSnapshot } from "../types.js";
import { getGcpAccessToken, parseServiceAccountJson } from "../google-auth.js";

const SERVICE = "generativelanguage.googleapis.com";

/** Published Gemini 2.5 Flash Free Tier caps when Cloud Quotas API is unavailable. */
export const GEMINI_FREE_TIER_FLASH = {
  model: "gemini-2.5-flash",
  rpm: 15,
  tpm: 250_000,
  rpd: 1_500,
} as const;

interface QuotaLimitRow {
  metric?: string;
  limit?: number;
  name?: string;
}

interface TimeSeriesPoint {
  value?: { int64Value?: string; doubleValue?: number };
  interval?: { endTime?: string };
}

interface TimeSeriesRow {
  metric?: { type?: string; labels?: Record<string, string> };
  resource?: { labels?: Record<string, string> };
  points?: TimeSeriesPoint[];
}

export interface MonitoringUsage {
  /** Requests since the current daily quota window opened (midnight Pacific). */
  requestCount24h: number;
  peakRpm: number;
  tokenCount24h: number;
  peakTpm: number;
}

const PACIFIC_TZ = "America/Los_Angeles";

function pacificOffsetMs(instantMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Gemini per-day quotas reset at midnight Pacific time, not on a rolling 24h window.
 * Returns the start of the current Pacific day and the next reset instant.
 */
export function pacificQuotaDay(now: Date = new Date()): { start: Date; resetAt: Date } {
  const nowMs = now.getTime();
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  // DST switches at 02:00 local, so the offset ~1h after UTC midnight+8h is the midnight offset.
  const midnightUtc = (yy: number, mm: number, dd: number) => {
    const naive = Date.UTC(yy, mm - 1, dd);
    return naive - pacificOffsetMs(naive + 8 * 60 * 60 * 1000);
  };
  const startMs = midnightUtc(y, m, d);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const resetMs = midnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { start: new Date(Math.min(startMs, nowMs)), resetAt: new Date(resetMs) };
}

function humanizeMetric(metric: string): string {
  const tail = metric.split("/").pop() ?? metric;
  return tail.replace(/\.googleapis\.com/g, "").replace(/_/g, " ");
}

function parseLimitValue(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (raw && typeof raw === "object" && "value" in raw) {
    return parseLimitValue((raw as { value?: unknown }).value);
  }
  return 0;
}

export function pointValue(point?: TimeSeriesPoint): number {
  if (!point?.value) return 0;
  if (point.value.int64Value != null) return Number(point.value.int64Value) || 0;
  if (point.value.doubleValue != null) return point.value.doubleValue || 0;
  return 0;
}

export function latestUsage(points?: TimeSeriesPoint[]): number {
  if (!points?.length) return 0;
  const sorted = [...points].sort((a, b) =>
    (b.interval?.endTime ?? "").localeCompare(a.interval?.endTime ?? ""),
  );
  return pointValue(sorted[0]);
}

export function sumPoints(points?: TimeSeriesPoint[]): number {
  if (!points?.length) return 0;
  return points.reduce((acc, point) => acc + pointValue(point), 0);
}

export function maxPoint(points?: TimeSeriesPoint[]): number {
  if (!points?.length) return 0;
  return Math.max(0, ...points.map(pointValue));
}

export function usedPercent(used: number, limit: number): number {
  if (!(limit > 0) || !Number.isFinite(used)) return 0;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}

export function isQuotaApiUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /permission[_\s-]?denied/i.test(msg) ||
    /PERMISSION_DENIED/.test(msg) ||
    /SERVICE_DISABLED/i.test(msg) ||
    /accessNotConfigured/i.test(msg) ||
    /Cloud Quotas API/i.test(msg) ||
    /consumerQuotaMetrics/i.test(msg) ||
    /billing account/i.test(msg)
  );
}

function quotaWindow(key: string, labelKey: string, used: number, limit: number): UsageQuotaWindow {
  return {
    key,
    labelKey,
    usedPercent: usedPercent(used, limit),
    usedCount: used,
    limitCount: limit,
  };
}

export function buildFreeTierQuotas(usage: MonitoringUsage, now: Date = new Date()): UsageQuotaWindow[] {
  const quotas: UsageQuotaWindow[] = [
    {
      ...quotaWindow(
        "gemini-free-rpd",
        "usage.gemini.quota.rpd",
        usage.requestCount24h,
        GEMINI_FREE_TIER_FLASH.rpd,
      ),
      resetAt: pacificQuotaDay(now).resetAt.toISOString(),
    },
    quotaWindow(
      "gemini-free-rpm",
      "usage.gemini.quota.rpm",
      usage.peakRpm,
      GEMINI_FREE_TIER_FLASH.rpm,
    ),
  ];
  if (usage.peakTpm > 0) {
    quotas.push(
      quotaWindow("gemini-free-tpm", "usage.gemini.quota.tpm", usage.peakTpm, GEMINI_FREE_TIER_FLASH.tpm),
    );
  }
  return quotas;
}

function guessPublishedLimit(metric: string): { limit: number; kind: "rpd" | "rpm" | "tpm" } | null {
  const m = metric.toLowerCase();
  const mentionsRequest = /request/.test(m);
  const mentionsToken = /token/.test(m);
  if (mentionsRequest && /day|daily|rpd/.test(m)) return { limit: GEMINI_FREE_TIER_FLASH.rpd, kind: "rpd" };
  if (mentionsRequest && /minute|rpm/.test(m)) return { limit: GEMINI_FREE_TIER_FLASH.rpm, kind: "rpm" };
  if (mentionsToken && /minute|tpm/.test(m)) return { limit: GEMINI_FREE_TIER_FLASH.tpm, kind: "tpm" };
  return null;
}

export function buildQuotasFromPublishedLimits(
  usageByMetric: Map<string, number>,
): UsageQuotaWindow[] {
  const quotas: UsageQuotaWindow[] = [];
  for (const [metric, used] of usageByMetric) {
    const guessed = guessPublishedLimit(metric);
    if (!guessed || used < 0) continue;
    quotas.push({
      key: metric,
      labelKey: metric,
      label: humanizeMetric(metric),
      usedPercent: usedPercent(used, guessed.limit),
      usedCount: used,
      limitCount: guessed.limit,
    });
  }
  return quotas.sort((a, b) => b.usedPercent - a.usedPercent).slice(0, 12);
}

function seriesModel(series: TimeSeriesRow): string {
  const labels = { ...series.resource?.labels, ...series.metric?.labels };
  return (labels.model || labels.model_id || labels.model_user_id || "").toLowerCase();
}

function pickFlashOrTotal(series: TimeSeriesRow[]): TimeSeriesRow[] {
  const flash = series.filter((row) => seriesModel(row).includes(GEMINI_FREE_TIER_FLASH.model));
  return flash.length > 0 ? flash : series;
}

export function peakAlignedSum(series: TimeSeriesRow[]): number {
  const byMinute = new Map<string, number>();
  for (const row of series) {
    for (const point of row.points ?? []) {
      const key = point.interval?.endTime ?? "";
      byMinute.set(key, (byMinute.get(key) ?? 0) + pointValue(point));
    }
  }
  return Math.max(0, ...byMinute.values(), 0);
}

function errorMessageFromBody(body: unknown, fallback: string, status: number): string {
  if (typeof body === "object" && body && "error" in body) {
    const msg = (body as { error?: { message?: unknown } }).error?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback || `HTTP ${String(status)}`;
}

async function gcpGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(errorMessageFromBody(body, res.statusText, res.status));
  }
  return body;
}

async function fetchTimeSeries(
  projectId: string,
  token: string,
  filter: string,
  extra: Record<string, string> = {},
  windowStart?: Date,
): Promise<TimeSeriesRow[]> {
  const end = new Date();
  const start = windowStart ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const data = (await gcpGet(
    `monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${new URLSearchParams({
      filter,
      "interval.endTime": end.toISOString(),
      "interval.startTime": start.toISOString(),
      ...extra,
    }).toString()}`,
    token,
  )) as { timeSeries?: TimeSeriesRow[] };
  return data.timeSeries ?? [];
}

async function fetchQuotaLimits(projectId: string, token: string): Promise<QuotaLimitRow[]> {
  const data = (await gcpGet(
    `serviceusage.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/services/${SERVICE}/consumerQuotaMetrics`,
    token,
  )) as { metrics?: unknown[] };

  const rows: QuotaLimitRow[] = [];
  for (const metric of data.metrics ?? []) {
    const metricName = (metric as { metric?: string }).metric ?? "";
    const limits = (metric as { consumerQuotaLimits?: unknown[] }).consumerQuotaLimits ?? [];
    for (const limit of limits) {
      const effective = (limit as { effectiveLimit?: unknown }).effectiveLimit;
      const limitValue = parseLimitValue(effective);
      if (limitValue <= 0) continue;
      rows.push({
        metric: metricName,
        limit: limitValue,
        name: (limit as { name?: string }).name ?? metricName,
      });
    }
  }
  return rows;
}

async function fetchAllocationUsage(projectId: string, token: string): Promise<Map<string, number>> {
  const filter = [
    'metric.type="serviceruntime.googleapis.com/quota/allocation/usage"',
    `resource.labels.service="${SERVICE}"`,
  ].join(" AND ");

  const series = await fetchTimeSeries(projectId, token, filter);
  const usage = new Map<string, number>();
  for (const row of series) {
    const metric = row.metric?.labels?.quota_metric;
    if (!metric) continue;
    usage.set(metric, latestUsage(row.points));
  }
  return usage;
}

const REQUEST_COUNT_FILTER = [
  'metric.type="serviceruntime.googleapis.com/api/request_count"',
  'resource.type="consumed_api"',
  `resource.labels.service="${SERVICE}"`,
].join(" AND ");

const MINUTE_ALIGN = {
  "aggregation.alignmentPeriod": "60s",
  "aggregation.perSeriesAligner": "ALIGN_SUM",
  "aggregation.crossSeriesReducer": "REDUCE_SUM",
};

async function fetchAlignedOrRaw(
  projectId: string,
  token: string,
  filter: string,
  extra: Record<string, string>,
  windowStart?: Date,
): Promise<TimeSeriesRow[]> {
  try {
    return await fetchTimeSeries(projectId, token, filter, extra, windowStart);
  } catch {
    return fetchTimeSeries(projectId, token, filter, {}, windowStart);
  }
}

async function fetchMonitoringUsage(projectId: string, token: string): Promise<MonitoringUsage> {
  const tokenFilters = [
    [
      'metric.type="serviceruntime.googleapis.com/quota/rate/net_usage"',
      `resource.labels.service="${SERVICE}"`,
    ].join(" AND "),
    'metric.type="aiplatform.googleapis.com/publisher/online_serving/token_count"',
  ];

  // Daily counts follow the Pacific-midnight quota day, not a rolling 24h window.
  const dayStart = pacificQuotaDay().start;
  const [requestSeries, ...tokenSeriesGroups] = await Promise.all([
    fetchAlignedOrRaw(projectId, token, REQUEST_COUNT_FILTER, MINUTE_ALIGN, dayStart),
    ...tokenFilters.map((filter) =>
      fetchTimeSeries(projectId, token, filter, {}, dayStart).catch(() => [] as TimeSeriesRow[]),
    ),
  ]);

  const tokenSeries = tokenSeriesGroups.flat();
  const tokenDelta = tokenSeries.filter((row) => /token_count$/i.test(row.metric?.type ?? ""));
  const tokenGauge = tokenSeries.filter((row) => {
    const quotaMetric = row.metric?.labels?.quota_metric ?? "";
    return /token/i.test(quotaMetric);
  });

  const requests = pickFlashOrTotal(requestSeries);
  const tokens = pickFlashOrTotal(tokenDelta);
  const tpm = pickFlashOrTotal(tokenGauge);
  return {
    requestCount24h: requests.reduce((acc, row) => acc + sumPoints(row.points), 0),
    peakRpm: peakAlignedSum(requests),
    tokenCount24h: tokens.reduce((acc, row) => acc + sumPoints(row.points), 0),
    peakTpm: peakAlignedSum(tpm),
  };
}

function buildQuotas(limits: QuotaLimitRow[], usage: Map<string, number>): UsageQuotaWindow[] {
  const quotas: UsageQuotaWindow[] = [];
  for (const row of limits) {
    const metric = row.metric ?? row.name ?? "unknown";
    const used = usage.get(metric) ?? 0;
    const limit = row.limit ?? 0;
    if (limit <= 0) continue;
    quotas.push({
      key: metric,
      labelKey: metric,
      label: humanizeMetric(metric),
      usedPercent: usedPercent(used, limit),
      usedCount: used,
      limitCount: limit,
    });
  }
  return quotas.sort((a, b) => b.usedPercent - a.usedPercent).slice(0, 12);
}

function emptySnapshot(
  quotas: UsageQuotaWindow[],
  quotaHintKey: UsageToolSnapshot["quotaHintKey"],
): Pick<UsageToolSnapshot, "quotas" | "daily" | "byModel" | "totalCostUsd" | "quotaHintKey"> {
  return {
    quotas,
    daily: [],
    byModel: undefined,
    totalCostUsd: 0,
    quotaHintKey,
  };
}

export async function testGeminiGcpCredentials(
  serviceAccountJson: string,
  projectIdHint?: string | null,
): Promise<void> {
  const sa = parseServiceAccountJson(serviceAccountJson);
  const projectId = projectIdHint?.trim() || sa.project_id;
  const token = await getGcpAccessToken(sa);

  try {
    const limits = await fetchQuotaLimits(projectId, token);
    if (limits.length > 0) return;
  } catch (err) {
    if (!isQuotaApiUnavailable(err)) throw err;
  }

  try {
    await fetchTimeSeries(projectId, token, REQUEST_COUNT_FILTER, MINUTE_ALIGN);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Quota API is unavailable (common on Free Tier without billing). ` +
        `Cloud Monitoring also failed: ${msg}. Grant roles/monitoring.viewer on the Gemini project.`,
    );
  }
}

export async function fetchGeminiGcpQuotas(
  serviceAccountJson: string,
  projectIdHint?: string | null,
): Promise<Pick<UsageToolSnapshot, "quotas" | "daily" | "byModel" | "totalCostUsd" | "quotaHintKey">> {
  const sa = parseServiceAccountJson(serviceAccountJson);
  const projectId = projectIdHint?.trim() || sa.project_id;
  const token = await getGcpAccessToken(sa);

  let limits: QuotaLimitRow[] = [];
  try {
    limits = await fetchQuotaLimits(projectId, token);
  } catch (err) {
    if (!isQuotaApiUnavailable(err)) throw err;
  }

  const allocationUsage = await fetchAllocationUsage(projectId, token).catch(() => new Map<string, number>());
  const official = buildQuotas(limits, allocationUsage);
  if (official.length > 0) {
    return emptySnapshot(official, "usage.gemini.quota.hint");
  }

  const fromAllocation = buildQuotasFromPublishedLimits(allocationUsage);
  if (fromAllocation.length > 0) {
    return emptySnapshot(fromAllocation, "usage.gemini.quota.hintFreeTier");
  }

  const monitoring = await fetchMonitoringUsage(projectId, token);
  const freeTier = buildFreeTierQuotas(monitoring);
  if (freeTier.length === 0) {
    throw new Error("No Gemini quota data available for this project");
  }
  return emptySnapshot(freeTier, "usage.gemini.quota.hintFreeTier");
}

export async function testGeminiApiKey(apiKey: string): Promise<void> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    throw new Error(errorMessageFromBody(body, res.statusText, res.status));
  }
}

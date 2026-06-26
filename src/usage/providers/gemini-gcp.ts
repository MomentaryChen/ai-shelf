import type { UsageQuotaWindow } from "../types.js";
import { getGcpAccessToken, parseServiceAccountJson, type GcpServiceAccount } from "../google-auth.js";

const SERVICE = "generativelanguage.googleapis.com";

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
  metric?: { labels?: Record<string, string> };
  points?: TimeSeriesPoint[];
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

function latestUsage(points?: TimeSeriesPoint[]): number {
  if (!points?.length) return 0;
  const sorted = [...points].sort((a, b) =>
    String(b.interval?.endTime ?? "").localeCompare(String(a.interval?.endTime ?? "")),
  );
  const point = sorted[0]?.value;
  if (!point) return 0;
  if (point.int64Value != null) return Number(point.int64Value) || 0;
  if (point.doubleValue != null) return Number(point.doubleValue) || 0;
  return 0;
}

async function gcpGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "error" in body
        ? String((body as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body;
}

async function fetchQuotaLimits(projectId: string, token: string): Promise<QuotaLimitRow[]> {
  const data = (await gcpGet(
    `serviceusage.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/services/${SERVICE}/consumerQuotaMetrics`,
    token,
  )) as { metrics?: unknown[] };

  const rows: QuotaLimitRow[] = [];
  for (const metric of data.metrics ?? []) {
    const metricName = String((metric as { metric?: string }).metric ?? "");
    const limits = (metric as { consumerQuotaLimits?: unknown[] }).consumerQuotaLimits ?? [];
    for (const limit of limits) {
      const effective = (limit as { effectiveLimit?: unknown }).effectiveLimit;
      const limitValue = parseLimitValue(effective);
      if (limitValue <= 0) continue;
      rows.push({
        metric: metricName,
        limit: limitValue,
        name: String((limit as { name?: string }).name ?? metricName),
      });
    }
  }
  return rows;
}

async function fetchAllocationUsage(projectId: string, token: string): Promise<Map<string, number>> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const filter = [
    'metric.type="serviceruntime.googleapis.com/quota/allocation/usage"',
    `resource.labels.service="${SERVICE}"`,
  ].join(" AND ");

  const data = (await gcpGet(
    `monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${new URLSearchParams({
      filter,
      "interval.endTime": end.toISOString(),
      "interval.startTime": start.toISOString(),
    }).toString()}`,
    token,
  )) as { timeSeries?: TimeSeriesRow[] };

  const usage = new Map<string, number>();
  for (const series of data.timeSeries ?? []) {
    const metric = series.metric?.labels?.quota_metric;
    if (!metric) continue;
    usage.set(metric, latestUsage(series.points));
  }
  return usage;
}

function buildQuotas(limits: QuotaLimitRow[], usage: Map<string, number>): UsageQuotaWindow[] {
  const quotas: UsageQuotaWindow[] = [];
  for (const row of limits) {
    const metric = row.metric ?? row.name ?? "unknown";
    const used = usage.get(metric) ?? 0;
    const limit = row.limit ?? 0;
    if (limit <= 0) continue;
    const usedPercent = Math.min(100, Math.round((used / limit) * 1000) / 10);
    quotas.push({
      key: metric,
      labelKey: metric,
      label: humanizeMetric(metric),
      usedPercent,
    });
  }
  return quotas.sort((a, b) => b.usedPercent - a.usedPercent).slice(0, 12);
}

export async function testGeminiGcpCredentials(
  serviceAccountJson: string,
  projectIdHint?: string | null,
): Promise<void> {
  const sa = parseServiceAccountJson(serviceAccountJson);
  const projectId = projectIdHint?.trim() || sa.project_id;
  const token = await getGcpAccessToken(sa);
  const limits = await fetchQuotaLimits(projectId, token);
  if (limits.length === 0) {
    throw new Error("No Gemini quota limits found for this GCP project");
  }
}

export async function fetchGeminiGcpQuotas(
  serviceAccountJson: string,
  projectIdHint?: string | null,
): Promise<Pick<import("../types.js").UsageToolSnapshot, "quotas" | "daily" | "byModel" | "totalCostUsd">> {
  const sa = parseServiceAccountJson(serviceAccountJson);
  const projectId = projectIdHint?.trim() || sa.project_id;
  const token = await getGcpAccessToken(sa);

  const [limits, usage] = await Promise.all([
    fetchQuotaLimits(projectId, token),
    fetchAllocationUsage(projectId, token).catch(() => new Map<string, number>()),
  ]);

  const quotas = buildQuotas(limits, usage);
  if (quotas.length === 0) {
    throw new Error("No Gemini quota data available for this project");
  }

  return {
    quotas,
    daily: [],
    byModel: undefined,
    totalCostUsd: 0,
  };
}

export async function testGeminiApiKey(apiKey: string): Promise<void> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body && "error" in body
        ? String((body as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

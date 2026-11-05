import {
  aggregateCursorEvents,
  aggregatedCostUsd,
  chunkDateRanges,
  fillCursorCostsFromAggregation,
  type CursorAggregatedUsage,
  type CursorUsageEvent,
} from "./cursor-shared.js";
import {
  quotasFromCurrentPeriodUsage,
  quotasFromUsageSummary,
  type CursorCurrentPeriodUsage,
  type CursorUsageSummaryResponse,
} from "./cursor-spending.js";
import { weekWindowMs } from "../attribution.js";
import type { UsageQuotaWindow } from "../types.js";

const DASHBOARD_BASE = "https://cursor.com";

function normalizeSessionToken(raw: string): string {
  const trimmed = raw.trim();
  const prefix = "WorkosCursorSessionToken=";
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

function sessionHeaders(sessionToken: string): Record<string, string> {
  const token = normalizeSessionToken(sessionToken);
  return {
    Cookie: `WorkosCursorSessionToken=${token}`,
    Origin: "https://cursor.com",
    "Content-Type": "application/json",
  };
}

async function dashboardGet(sessionToken: string, path: string): Promise<unknown> {
  const res = await fetch(`${DASHBOARD_BASE}${path}`, {
    headers: { Cookie: sessionHeaders(sessionToken).Cookie },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error?: string }).error ?? res.statusText)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return payload;
}

async function dashboardPost(
  sessionToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${DASHBOARD_BASE}${path}`, {
    method: "POST",
    headers: sessionHeaders(sessionToken),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error?: string }).error ?? res.statusText)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return payload;
}

interface DashboardEventsResponse {
  totalUsageEventsCount?: number;
  usageEventsDisplay?: CursorUsageEvent[];
  usageEvents?: CursorUsageEvent[];
}

async function fetchDashboardEventsInRange(
  sessionToken: string,
  startDate: number,
  endDate: number,
): Promise<CursorUsageEvent[]> {
  const events: CursorUsageEvent[] = [];
  let page = 1;
  const pageSize = 100;

  while (page <= 50) {
    const data = (await dashboardPost(sessionToken, "/api/dashboard/get-filtered-usage-events", {
      startDate: String(startDate),
      endDate: String(endDate),
      page,
      pageSize,
    })) as DashboardEventsResponse;

    const batch = data.usageEventsDisplay ?? data.usageEvents ?? [];
    events.push(...batch);

    const total = data.totalUsageEventsCount ?? 0;
    if (page * pageSize >= total || batch.length === 0) break;
    page += 1;
  }

  return events;
}

/** Verify session works (optional lightweight check). */
export async function testCursorDashboardSession(sessionToken: string): Promise<void> {
  await fetchCursorDashboardSpending(sessionToken);
}

async function fetchUsageSummary(sessionToken: string): Promise<CursorUsageSummaryResponse> {
  const endpoints = ["/api/usage-summary", "/api/dashboard/usage-summary"];
  let lastError: unknown;
  for (const path of endpoints) {
    try {
      return (await dashboardGet(sessionToken, path)) as CursorUsageSummaryResponse;
    } catch (err: unknown) {
      lastError = err;
      const message = (err as Error).message ?? "";
      if (!/\b404\b/.test(message) && !/not found/i.test(message)) throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to load Cursor spending summary");
}

export async function fetchCursorDashboardSpending(
  sessionToken: string,
): Promise<{ quotas: UsageQuotaWindow[] }> {
  const summary = await fetchUsageSummary(sessionToken);
  const quotas = quotasFromUsageSummary(summary);
  if (quotas.length === 0) {
    throw new Error("No Cursor spending data in usage summary");
  }
  return { quotas };
}

async function fetchAggregatedUsage(
  sessionToken: string,
  startMs: number,
  endMs: number,
): Promise<CursorAggregatedUsage | null> {
  const bodies: Record<string, unknown>[] = [
    { teamId: -1, startDate: startMs, endDate: endMs },
    { teamId: 0, startDate: String(startMs), endDate: String(endMs) },
  ];
  let empty: CursorAggregatedUsage | null = null;
  for (const body of bodies) {
    try {
      const data = (await dashboardPost(
        sessionToken,
        "/api/dashboard/get-aggregated-usage-events",
        body,
      )) as CursorAggregatedUsage;
      if (aggregatedCostUsd(data) > 0 || (data.aggregations?.length ?? 0) > 0) return data;
      empty ??= data;
    } catch {
      // The dashboard accepts either numeric timestamps or epoch strings. Try the other shape.
    }
  }
  return empty;
}

async function fetchCurrentPeriodUsage(
  sessionToken: string,
): Promise<CursorCurrentPeriodUsage | null> {
  try {
    return (await dashboardPost(
      sessionToken,
      "/api/dashboard/get-current-period-usage",
      {},
    )) as CursorCurrentPeriodUsage;
  } catch {
    return null;
  }
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchCursorDashboardUsage(
  sessionToken: string,
  days: number,
): Promise<
  Pick<
    import("../types.js").UsageToolSnapshot,
    | "daily"
    | "byModel"
    | "totalCostUsd"
    | "totalInputTokens"
    | "totalOutputTokens"
    | "quotas"
    | "weekCostUsd"
  >
> {
  const ranges = chunkDateRanges(days);
  const periodStart = ranges[0]?.startDate ?? Date.now();
  const periodEnd = ranges[ranges.length - 1]?.endDate ?? Date.now();
  const week = weekWindowMs();

  const periodUsagePromise = fetchCurrentPeriodUsage(sessionToken);
  const events: CursorUsageEvent[] = [];
  for (const range of ranges) {
    const batch = await fetchDashboardEventsInRange(sessionToken, range.startDate, range.endDate);
    events.push(...batch);
  }
  let usage = aggregateCursorEvents(events);

  // Per-event chargedCents is often 0 for included usage. Aggregated cents still
  // cover the selected window, which is what Cost decisions adds up.
  if (usage.totalCostUsd <= 0) {
    const [periodAgg, weekAgg] = await Promise.all([
      fetchAggregatedUsage(sessionToken, periodStart, periodEnd),
      fetchAggregatedUsage(sessionToken, week.startMs, week.endMs),
    ]);
    const weekCost = aggregatedCostUsd(weekAgg);
    usage = fillCursorCostsFromAggregation(usage, periodAgg, {
      costUsd: weekCost,
      startDate: utcDay(week.startMs),
      endDate: utcDay(week.endMs),
    });
  }

  let quotas: UsageQuotaWindow[] = quotasFromCurrentPeriodUsage(await periodUsagePromise);
  if (quotas.length === 0) {
    try {
      const summary = await fetchUsageSummary(sessionToken);
      quotas = quotasFromUsageSummary(summary);
    } catch {
      // Event history still useful when spending summary is unavailable.
    }
  }

  return { ...usage, quotas: quotas.length > 0 ? quotas : undefined };
}

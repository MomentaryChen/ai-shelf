import {
  aggregateCursorEvents,
  chunkDateRanges,
  type CursorUsageEvent,
} from "./cursor-shared.js";
import {
  quotasFromUsageSummary,
  type CursorUsageSummaryResponse,
} from "./cursor-spending.js";
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
  throw lastError instanceof Error ? lastError : new Error("Failed to load Cursor spending summary");
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

export async function fetchCursorDashboardUsage(
  sessionToken: string,
  days: number,
): Promise<
  Pick<
    import("../types.js").UsageToolSnapshot,
    "daily" | "byModel" | "totalCostUsd" | "totalInputTokens" | "totalOutputTokens" | "quotas"
  >
> {
  const ranges = chunkDateRanges(days);
  const events: CursorUsageEvent[] = [];
  for (const range of ranges) {
    const batch = await fetchDashboardEventsInRange(sessionToken, range.startDate, range.endDate);
    events.push(...batch);
  }
  const usage = aggregateCursorEvents(events);

  let quotas: UsageQuotaWindow[] = [];
  try {
    const summary = await fetchUsageSummary(sessionToken);
    quotas = quotasFromUsageSummary(summary);
  } catch {
    // Event history still useful when spending summary is unavailable.
  }

  return { ...usage, quotas: quotas.length > 0 ? quotas : undefined };
}

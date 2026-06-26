import { fetchCursorDashboardUsage } from "./cursor-dashboard.js";
import {
  aggregateCursorEvents,
  chunkDateRanges,
  type CursorUsageEvent,
} from "./cursor-shared.js";

const API_BASE = "https://api.cursor.com";

interface CursorUsageEventsResponse {
  usageEvents?: CursorUsageEvent[];
  pagination?: {
    hasNextPage?: boolean;
  };
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf-8").toString("base64")}`;
}

async function cursorAdminPost(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message ?? res.statusText)
        : typeof payload === "object" && payload && "error" in payload
          ? String((payload as { error?: string }).error ?? res.statusText)
          : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return payload;
}

async function fetchAdminEventsInRange(
  apiKey: string,
  startDate: number,
  endDate: number,
): Promise<CursorUsageEvent[]> {
  const events: CursorUsageEvent[] = [];
  let page = 1;
  const pageSize = 100;

  while (page <= 50) {
    const data = (await cursorAdminPost("/teams/filtered-usage-events", apiKey, {
      startDate,
      endDate,
      page,
      pageSize,
    })) as CursorUsageEventsResponse;

    events.push(...(data.usageEvents ?? []));
    if (!data.pagination?.hasNextPage) break;
    page += 1;
  }

  return events;
}

export async function fetchCursorAdminUsage(
  adminApiKey: string,
  days: number,
): Promise<
  Pick<
    import("../types.js").UsageToolSnapshot,
    "daily" | "byModel" | "totalCostUsd" | "totalInputTokens" | "totalOutputTokens"
  >
> {
  const ranges = chunkDateRanges(days);
  const events: CursorUsageEvent[] = [];
  for (const range of ranges) {
    const batch = await fetchAdminEventsInRange(adminApiKey, range.startDate, range.endDate);
    events.push(...batch);
  }
  return aggregateCursorEvents(events);
}

export type CursorUsageAuthSource = "usage.cursor.auth.team.title" | "usage.cursor.auth.personal.title";

export async function fetchCursorUsage(
  creds: { adminApiKey?: string | null; sessionToken?: string | null },
  days: number,
): Promise<
  Pick<
    import("../types.js").UsageToolSnapshot,
    "daily" | "byModel" | "totalCostUsd" | "totalInputTokens" | "totalOutputTokens"
  > & { authSourceKey: CursorUsageAuthSource }
> {
  const adminKey = creds.adminApiKey?.trim();
  const sessionToken = creds.sessionToken?.trim();

  if (adminKey) {
    try {
      const data = await fetchCursorAdminUsage(adminKey, days);
      return { ...data, authSourceKey: "usage.cursor.auth.team.title" };
    } catch (err: unknown) {
      if (!sessionToken) throw err;
    }
  }

  if (sessionToken) {
    const data = await fetchCursorDashboardUsage(sessionToken, days);
    return { ...data, authSourceKey: "usage.cursor.auth.personal.title" };
  }

  throw new Error("No Cursor credentials configured");
}

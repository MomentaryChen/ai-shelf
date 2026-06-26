import type { UsageToolSnapshot } from "../types.js";
import { fetchClaudeDashboardUsage } from "./claude-dashboard.js";

const API_BASE = "https://api.anthropic.com";

function isoDayStart(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function anthropicGet(path: string, apiKey: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
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

function parseCostBuckets(data: unknown): import("../types.js").UsageDayBucket[] {
  const buckets: import("../types.js").UsageDayBucket[] = [];
  const rows = (data as { data?: unknown[] })?.data;
  if (!Array.isArray(rows)) return buckets;
  for (const bucket of rows) {
    const startingAt = (bucket as { starting_at?: string }).starting_at;
    const date = startingAt?.slice(0, 10) ?? "unknown";
    let costCents = 0;
    const results = (bucket as { results?: unknown[] }).results;
    if (Array.isArray(results)) {
      for (const row of results) {
        const amount = (row as { amount?: string | number }).amount;
        const n = typeof amount === "string" ? parseFloat(amount) : Number(amount ?? 0);
        if (Number.isFinite(n)) costCents += n;
      }
    }
    buckets.push({ date, costUsd: costCents / 100 });
  }
  return buckets.sort((a, b) => a.date.localeCompare(b.date));
}

function parseUsageBuckets(data: unknown): {
  daily: Map<string, { input: number; output: number }>;
  byModel: import("../types.js").UsageModelBreakdown[];
} {
  const daily = new Map<string, { input: number; output: number }>();
  const modelTotals = new Map<string, { input: number; output: number }>();
  const rows = (data as { data?: unknown[] })?.data;
  if (!Array.isArray(rows)) return { daily, byModel: [] };

  for (const bucket of rows) {
    const startingAt = (bucket as { starting_at?: string }).starting_at;
    const date = startingAt?.slice(0, 10) ?? "unknown";
    const results = (bucket as { results?: unknown[] }).results;
    if (!Array.isArray(results)) continue;
    for (const row of results) {
      const model = String((row as { model?: string }).model ?? "unknown");
      const uncached = Number((row as { uncached_input_tokens?: number }).uncached_input_tokens ?? 0);
      const cacheRead = Number((row as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0);
      const cacheCreate = Number((row as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0);
      const output = Number((row as { output_tokens?: number }).output_tokens ?? 0);
      const input = uncached + cacheRead + cacheCreate;

      const day = daily.get(date) ?? { input: 0, output: 0 };
      day.input += input;
      day.output += output;
      daily.set(date, day);

      const modelRow = modelTotals.get(model) ?? { input: 0, output: 0 };
      modelRow.input += input;
      modelRow.output += output;
      modelTotals.set(model, modelRow);
    }
  }

  const byModel = [...modelTotals.entries()]
    .map(([model, t]) => ({
      model,
      costUsd: 0,
      inputTokens: t.input,
      outputTokens: t.output,
    }))
    .sort((a, b) => (b.inputTokens ?? 0) - (a.inputTokens ?? 0));

  return { daily, byModel };
}

export async function fetchClaudeAdminUsage(
  adminApiKey: string,
  days: number,
): Promise<
  Pick<UsageToolSnapshot, "daily" | "byModel" | "totalCostUsd" | "totalInputTokens" | "totalOutputTokens">
> {
  const startingAt = isoDayStart(days);
  const endingAt = isoNow();

  const [costData, usageData] = await Promise.all([
    anthropicGet("/v1/organizations/cost_report", adminApiKey, {
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: "1d",
      limit: String(Math.min(days, 31)),
    }),
    anthropicGet("/v1/organizations/usage_report/messages", adminApiKey, {
      starting_at: startingAt,
      ending_at: endingAt,
      bucket_width: "1d",
      limit: String(Math.min(days, 31)),
    }),
  ]);

  const costDaily = parseCostBuckets(costData);
  const { daily: usageDaily, byModel } = parseUsageBuckets(usageData);

  const dateSet = new Set([...costDaily.map((d) => d.date), ...usageDaily.keys()]);
  const daily = [...dateSet]
    .sort()
    .map((date) => {
      const cost = costDaily.find((d) => d.date === date)?.costUsd ?? 0;
      const usage = usageDaily.get(date);
      return {
        date,
        costUsd: cost,
        inputTokens: usage?.input,
        outputTokens: usage?.output,
      };
    });

  const totalCostUsd = daily.reduce((s, d) => s + d.costUsd, 0);
  const totalInputTokens = daily.reduce((s, d) => s + (d.inputTokens ?? 0), 0);
  const totalOutputTokens = daily.reduce((s, d) => s + (d.outputTokens ?? 0), 0);

  return { daily, byModel, totalCostUsd, totalInputTokens, totalOutputTokens };
}

export type ClaudeUsageAuthSource =
  | "usage.claude.auth.team.title"
  | "usage.claude.auth.personal.title";

export async function fetchClaudeUsage(
  creds: {
    adminApiKey?: string | null;
    sessionKey?: string | null;
    orgId?: string | null;
    cfClearance?: string | null;
  },
  days: number,
): Promise<
  Pick<
    UsageToolSnapshot,
    | "daily"
    | "byModel"
    | "totalCostUsd"
    | "totalInputTokens"
    | "totalOutputTokens"
    | "quotas"
  > & { authSourceKey: ClaudeUsageAuthSource }
> {
  const adminKey = creds.adminApiKey?.trim();
  const sessionKey = creds.sessionKey?.trim();

  if (adminKey) {
    try {
      const data = await fetchClaudeAdminUsage(adminKey, days);
      return { ...data, authSourceKey: "usage.claude.auth.team.title" };
    } catch (err: unknown) {
      if (!sessionKey) throw err;
    }
  }

  if (sessionKey) {
    const data = await fetchClaudeDashboardUsage({
      sessionKey,
      orgId: creds.orgId,
      cfClearance: creds.cfClearance,
    });
    return { ...data, authSourceKey: "usage.claude.auth.personal.title" };
  }

  throw new Error("No Claude credentials configured");
}

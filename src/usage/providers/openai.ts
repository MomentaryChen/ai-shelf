import type { UsageDayBucket, UsageModelBreakdown } from "../types.js";

const API_BASE = "https://api.openai.com";

function unixDayStart(daysAgo: number): number {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

async function openaiAdminGet(path: string, adminApiKey: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${adminApiKey}`,
    },
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

function parseCostBuckets(data: unknown): { daily: UsageDayBucket[]; byModel: UsageModelBreakdown[] } {
  const daily: UsageDayBucket[] = [];
  const modelTotals = new Map<string, number>();
  const rows = (data as { data?: unknown[] })?.data;
  if (!Array.isArray(rows)) return { daily, byModel: [] };

  for (const bucket of rows) {
    const start = Number((bucket as { start_time?: number }).start_time ?? 0);
    const date = start ? new Date(start * 1000).toISOString().slice(0, 10) : "unknown";
    let costUsd = 0;
    const results = (bucket as { results?: unknown[] }).results;
    if (Array.isArray(results)) {
      for (const row of results) {
        const amount = (row as { amount?: { value?: string | number } | string | number }).amount;
        let value = 0;
        if (typeof amount === "object" && amount && "value" in amount) {
          value = parseFloat(String(amount.value ?? 0));
        } else {
          value = parseFloat(String(amount ?? 0));
        }
        if (Number.isFinite(value)) costUsd += value;

        const lineItem = String((row as { line_item?: string }).line_item ?? "");
        const modelMatch = /model[:\s]+([^\s,]+)/i.exec(lineItem);
        const model = modelMatch?.[1] ?? (lineItem || "other");
        if (value > 0) modelTotals.set(model, (modelTotals.get(model) ?? 0) + value);
      }
    }
    daily.push({ date, costUsd });
  }

  const byModel = [...modelTotals.entries()]
    .map(([model, costUsd]) => ({ model, costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return { daily: daily.sort((a, b) => a.date.localeCompare(b.date)), byModel };
}

export async function fetchOpenAiUsage(
  adminApiKey: string,
  days: number,
): Promise<Pick<import("../types.js").UsageToolSnapshot, "daily" | "byModel" | "totalCostUsd">> {
  const limit = Math.min(Math.max(days, 1), 180);
  const data = await openaiAdminGet("/v1/organization/costs", adminApiKey, {
    start_time: String(unixDayStart(days)),
    limit: String(limit),
    bucket_width: "1d",
    group_by: "line_item",
  });

  const { daily, byModel } = parseCostBuckets(data);
  const totalCostUsd = daily.reduce((s, d) => s + d.costUsd, 0);
  return { daily, byModel, totalCostUsd };
}

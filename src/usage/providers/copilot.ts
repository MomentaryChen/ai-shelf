import type { UsageDayBucket, UsageModelBreakdown, UsageToolSnapshot } from "../types.js";

const API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";
const CREDIT_USD = 0.01;

interface ReportLinks {
  download_links?: string[];
  report_start_day?: string;
  report_end_day?: string;
}

interface CliTokenUsage {
  prompt_tokens_sum?: number;
  output_tokens_sum?: number;
}

interface DayAggregate {
  day?: string;
  totals_by_cli?: { token_usage?: CliTokenUsage };
  totals_by_language_model?: Array<{ model?: string; code_generation_activity_count?: number }>;
  totals_by_model_feature?: Array<{ model?: string; code_generation_activity_count?: number }>;
}

interface UserDayRow {
  day?: string;
  ai_credits_used?: number;
}

function githubHeaders(pat: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pat.trim()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "ai-shelf-usage",
  };
}

async function githubGet(path: string, pat: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: githubHeaders(pat),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message?: string }).message ?? res.statusText)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body;
}

async function downloadText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Report download failed (HTTP ${res.status})`);
  return res.text();
}

function parseNdjson(text: string): unknown[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function parseReportPayload(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return parseNdjson(trimmed);
  }
}

async function resolveOrg(pat: string, orgHint?: string | null): Promise<string> {
  const hint = orgHint?.trim();
  if (hint) return hint;
  const orgs = (await githubGet("/user/orgs", pat)) as Array<{ login?: string }>;
  const login = orgs.find((o) => o.login?.trim())?.login?.trim();
  if (!login) {
    throw new Error("No GitHub organization found — set organization slug in credentials");
  }
  return login;
}

async function fetchReportText(pat: string, path: string): Promise<string> {
  const links = (await githubGet(path, pat)) as ReportLinks;
  const url = links.download_links?.[0];
  if (!url) throw new Error("No Copilot metrics report available yet");
  return downloadText(url);
}

function extractDayRecords(payload: unknown): DayAggregate[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((row) => extractDayRecords(row));
  }
  const obj = payload as DayAggregate & { day_totals?: DayAggregate[] };
  if (Array.isArray(obj.day_totals)) return obj.day_totals;
  if (obj.day) return [obj];
  return [];
}

function extractUserRows(text: string): UserDayRow[] {
  const rows: UserDayRow[] = [];
  for (const item of parseReportPayload(text)) {
    if (Array.isArray(item)) {
      for (const row of item) rows.push(row as UserDayRow);
      continue;
    }
    const obj = item as UserDayRow & { day_totals?: UserDayRow[] };
    if (Array.isArray(obj.day_totals)) rows.push(...obj.day_totals);
    else if (obj.day) rows.push(obj);
  }
  return rows;
}

function aggregateOrgDays(dayRecords: DayAggregate[]): {
  daily: UsageDayBucket[];
  byModel: UsageModelBreakdown[];
  totalInputTokens: number;
  totalOutputTokens: number;
} {
  const dailyMap = new Map<string, { input: number; output: number }>();
  const modelMap = new Map<string, number>();

  for (const record of dayRecords) {
    const day = record.day?.slice(0, 10);
    if (!day) continue;

    const cli = record.totals_by_cli?.token_usage;
    const input = Number(cli?.prompt_tokens_sum ?? 0);
    const output = Number(cli?.output_tokens_sum ?? 0);
    const dayRow = dailyMap.get(day) ?? { input: 0, output: 0 };
    dayRow.input += input;
    dayRow.output += output;
    dailyMap.set(day, dayRow);

    for (const row of [...(record.totals_by_language_model ?? []), ...(record.totals_by_model_feature ?? [])]) {
      const model = row.model?.trim();
      if (!model) continue;
      const count = Number(row.code_generation_activity_count ?? 0);
      if (count > 0) modelMap.set(model, (modelMap.get(model) ?? 0) + count);
    }
  }

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      costUsd: 0,
      inputTokens: row.input || undefined,
      outputTokens: row.output || undefined,
    }));

  const byModel = [...modelMap.entries()]
    .map(([model, count]) => ({
      model,
      costUsd: 0,
      inputTokens: count,
      outputTokens: undefined,
    }))
    .sort((a, b) => (b.inputTokens ?? 0) - (a.inputTokens ?? 0));

  const totalInputTokens = daily.reduce((s, d) => s + (d.inputTokens ?? 0), 0);
  const totalOutputTokens = daily.reduce((s, d) => s + (d.outputTokens ?? 0), 0);

  return { daily, byModel, totalInputTokens, totalOutputTokens };
}

function aggregateCredits(userRows: UserDayRow[]): Map<string, number> {
  const creditsByDay = new Map<string, number>();
  for (const row of userRows) {
    const day = row.day?.slice(0, 10);
    const credits = Number(row.ai_credits_used ?? 0);
    if (!day || !Number.isFinite(credits) || credits <= 0) continue;
    creditsByDay.set(day, (creditsByDay.get(day) ?? 0) + credits);
  }
  return creditsByDay;
}

function mergeDailyCost(
  daily: UsageDayBucket[],
  creditsByDay: Map<string, number>,
): { daily: UsageDayBucket[]; totalCostUsd: number } {
  const dateSet = new Set([...daily.map((d) => d.date), ...creditsByDay.keys()]);
  const merged = [...dateSet]
    .sort()
    .map((date) => {
      const base = daily.find((d) => d.date === date);
      const credits = creditsByDay.get(date) ?? 0;
      return {
        date,
        costUsd: credits * CREDIT_USD,
        inputTokens: base?.inputTokens,
        outputTokens: base?.outputTokens,
      };
    });
  const totalCostUsd = merged.reduce((s, d) => s + d.costUsd, 0);
  return { daily: merged, totalCostUsd };
}

export async function testCopilotPat(pat: string): Promise<void> {
  await githubGet("/user", pat);
}

export type CopilotUsageAuthSource =
  | "usage.copilot.auth.org.title"
  | "usage.copilot.auth.enterprise.title";

export async function fetchCopilotUsage(
  creds: {
    pat?: string | null;
    org?: string | null;
    enterprise?: string | null;
  },
  days: number,
): Promise<
  Pick<
    UsageToolSnapshot,
    "daily" | "byModel" | "totalCostUsd" | "totalInputTokens" | "totalOutputTokens"
  > & { authSourceKey: CopilotUsageAuthSource }
> {
  const pat = creds.pat?.trim();
  if (!pat) throw new Error("No Copilot credentials configured");

  const enterprise = creds.enterprise?.trim();
  const span = Math.min(Math.max(days, 1), 28);

  if (enterprise) {
    const [orgText, userText] = await Promise.all([
      fetchReportText(pat, `/enterprises/${encodeURIComponent(enterprise)}/copilot/metrics/reports/enterprise-28-day/latest`),
      fetchReportText(pat, `/enterprises/${encodeURIComponent(enterprise)}/copilot/metrics/reports/users-28-day/latest`).catch(
        () => "",
      ),
    ]);

    const dayRecords = parseReportPayload(orgText).flatMap((row) => extractDayRecords(row));
    const userRows = userText ? extractUserRows(userText) : [];
    const { daily, byModel, totalInputTokens, totalOutputTokens } = aggregateOrgDays(dayRecords);
    const { daily: mergedDaily, totalCostUsd } = mergeDailyCost(daily, aggregateCredits(userRows));

    if (mergedDaily.length === 0) {
      throw new Error("No Copilot usage data in enterprise report");
    }

    return {
      daily: mergedDaily.slice(-span),
      byModel,
      totalCostUsd,
      totalInputTokens,
      totalOutputTokens,
      authSourceKey: "usage.copilot.auth.enterprise.title",
    };
  }

  const org = await resolveOrg(pat, creds.org);
  const [orgText, userText] = await Promise.all([
    fetchReportText(pat, `/orgs/${encodeURIComponent(org)}/copilot/metrics/reports/organization-28-day/latest`),
    fetchReportText(pat, `/orgs/${encodeURIComponent(org)}/copilot/metrics/reports/users-28-day/latest`).catch(
      () => "",
    ),
  ]);

  const dayRecords = parseReportPayload(orgText).flatMap((row) => extractDayRecords(row));
  const userRows = userText ? extractUserRows(userText) : [];
  const { daily, byModel, totalInputTokens, totalOutputTokens } = aggregateOrgDays(dayRecords);
  const { daily: mergedDaily, totalCostUsd } = mergeDailyCost(daily, aggregateCredits(userRows));

  if (mergedDaily.length === 0) {
    throw new Error("No Copilot usage data — enable Copilot usage metrics for your organization");
  }

  return {
    daily: mergedDaily.slice(-span),
    byModel,
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
    authSourceKey: "usage.copilot.auth.org.title",
  };
}

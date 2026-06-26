import type { UsageQuotaWindow, UsageToolSnapshot } from "../types.js";

const DASHBOARD_BASE = "https://claude.ai";
interface UsageWindow {
  utilization?: number;
  resets_at?: string | null;
}

interface ClaudeUsageResponse {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
  seven_day_sonnet?: UsageWindow | null;
  seven_day_opus?: UsageWindow | null;
  seven_day_oauth_apps?: UsageWindow | null;
  seven_day_cowork?: UsageWindow | null;
  seven_day_omelette?: UsageWindow | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number | null;
    used_credits?: number | null;
    utilization?: number | null;
    currency?: string;
  } | null;
}

type OrgRow = { uuid?: string };

export interface ClaudeDashboardCreds {
  sessionKey: string;
  orgId?: string | null;
  cfClearance?: string | null;
}

interface ParsedCookies {
  sessionKey: string;
  cfClearance?: string;
  lastActiveOrg?: string;
}

function normalizeSessionKey(raw: string): string {
  const trimmed = raw.trim();
  const prefix = "sessionkey=";
  if (trimmed.toLowerCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

function parseCookieJar(raw: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (name && value) jar.set(name, value);
  }
  return jar;
}

function parseClaudeCookies(creds: ClaudeDashboardCreds): ParsedCookies {
  const raw = creds.sessionKey.trim();
  const jar = raw.includes(";") || /sessionkey=/i.test(raw) ? parseCookieJar(raw) : null;

  const sessionKey = jar?.get("sessionkey") ?? normalizeSessionKey(raw);
  const cfClearance = creds.cfClearance?.trim() || jar?.get("cf_clearance");
  const lastActiveOrg = creds.orgId?.trim() || jar?.get("lastactiveorg");

  return {
    sessionKey,
    cfClearance: cfClearance || undefined,
    lastActiveOrg: lastActiveOrg || undefined,
  };
}

function cookieHeader(cookies: ParsedCookies): string {
  const parts = [`sessionKey=${cookies.sessionKey}`];
  if (cookies.lastActiveOrg) parts.push(`lastActiveOrg=${cookies.lastActiveOrg}`);
  if (cookies.cfClearance) parts.push(`cf_clearance=${cookies.cfClearance}`);
  return parts.join("; ");
}

function dashboardHeaders(cookies: ParsedCookies): Record<string, string> {
  return {
    Cookie: cookieHeader(cookies),
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: DASHBOARD_BASE,
    Referer: `${DASHBOARD_BASE}/settings/usage`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}

function forbiddenMessageFallback(): string {
  return [
    "Forbidden: claude.ai rejected the session.",
    "Copy a fresh sessionKey from DevTools (logged into claude.ai). cf_clearance is optional — restart the app after updating credentials.",
  ].join(" ");
}

async function dashboardGetViaNet(cookies: ParsedCookies, path: string): Promise<unknown> {
  const { chromiumFetch } = await import("../chromium-fetch.js");
  const res = await chromiumFetch(`${DASHBOARD_BASE}${path}`, {
    headers: dashboardHeaders(cookies),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403) throw new Error(forbiddenMessageFallback());
    const msg =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error?: string }).error ?? res.statusText)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return payload;
}

async function dashboardGet(cookies: ParsedCookies, path: string): Promise<unknown> {
  try {
    const { fetchClaudeApiInBrowser } = await import("../../electron/claude-usage-fetch.js");
    return await fetchClaudeApiInBrowser(
      {
        sessionKey: cookies.sessionKey,
        lastActiveOrg: cookies.lastActiveOrg,
        cfClearance: cookies.cfClearance,
      },
      path,
    );
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ERR_MODULE_NOT_FOUND") {
      return dashboardGetViaNet(cookies, path);
    }
    throw err;
  }
}

function clampPercent(utilization: number): number {
  if (!Number.isFinite(utilization)) return 0;
  if (utilization <= 1) return Math.round(utilization * 1000) / 10;
  return Math.min(100, Math.round(utilization * 10) / 10);
}

function pushWindow(
  quotas: UsageQuotaWindow[],
  key: string,
  labelKey: string,
  window?: UsageWindow | null,
): void {
  if (!window || window.utilization == null) return;
  quotas.push({
    key,
    labelKey,
    usedPercent: clampPercent(window.utilization),
    resetAt: window.resets_at ?? undefined,
  });
}

function buildQuotas(data: ClaudeUsageResponse): UsageQuotaWindow[] {
  const quotas: UsageQuotaWindow[] = [];
  pushWindow(quotas, "five_hour", "usage.claude.quota.fiveHour", data.five_hour);
  pushWindow(quotas, "seven_day", "usage.claude.quota.sevenDay", data.seven_day);
  pushWindow(quotas, "seven_day_sonnet", "usage.claude.quota.sevenDaySonnet", data.seven_day_sonnet);
  pushWindow(quotas, "seven_day_opus", "usage.claude.quota.sevenDayOpus", data.seven_day_opus);
  pushWindow(quotas, "seven_day_oauth_apps", "usage.claude.quota.sevenDayOAuth", data.seven_day_oauth_apps);
  pushWindow(quotas, "seven_day_cowork", "usage.claude.quota.sevenDayCowork", data.seven_day_cowork);
  pushWindow(quotas, "seven_day_omelette", "usage.claude.quota.sevenDayDesign", data.seven_day_omelette);

  const extra = data.extra_usage;
  if (extra?.is_enabled && extra.utilization != null) {
    quotas.push({
      key: "extra_usage",
      labelKey: "usage.claude.quota.extraUsage",
      usedPercent: clampPercent(extra.utilization),
    });
  }

  return quotas.sort((a, b) => b.usedPercent - a.usedPercent);
}

async function resolveOrgId(cookies: ParsedCookies): Promise<string> {
  if (cookies.lastActiveOrg) return cookies.lastActiveOrg;

  const orgs = (await dashboardGet(cookies, "/api/organizations")) as OrgRow[];
  if (!Array.isArray(orgs) || !orgs[0]?.uuid?.trim()) {
    throw new Error("Could not resolve Claude organization id — set Organization ID in credentials");
  }
  return orgs[0].uuid.trim();
}

function toParsed(creds: ClaudeDashboardCreds): ParsedCookies {
  const parsed = parseClaudeCookies(creds);
  if (!parsed.sessionKey.startsWith("sk-ant-sid")) {
    throw new Error("sessionKey should start with sk-ant-sid… — copy the sessionKey cookie value from claude.ai");
  }
  return parsed;
}

export async function testClaudeDashboardSession(creds: ClaudeDashboardCreds): Promise<void> {
  const cookies = toParsed(creds);
  const orgId = await resolveOrgId(cookies);
  await dashboardGet({ ...cookies, lastActiveOrg: orgId }, `/api/organizations/${orgId}/usage`);
}

export async function fetchClaudeDashboardUsage(
  creds: ClaudeDashboardCreds,
): Promise<
  Pick<UsageToolSnapshot, "quotas" | "totalCostUsd" | "daily" | "byModel"> & {
    authSourceKey: "usage.claude.auth.personal.title";
  }
> {
  const cookies = toParsed(creds);
  const orgId = await resolveOrgId(cookies);
  const withOrg = { ...cookies, lastActiveOrg: orgId };
  const data = (await dashboardGet(
    withOrg,
    `/api/organizations/${orgId}/usage`,
  )) as ClaudeUsageResponse;

  const quotas = buildQuotas(data);
  if (quotas.length === 0) {
    throw new Error("No quota data returned from claude.ai");
  }

  let totalCostUsd = 0;
  const extra = data.extra_usage;
  if (extra?.used_credits != null && Number.isFinite(extra.used_credits)) {
    totalCostUsd = Number(extra.used_credits) / 100;
  }

  return {
    quotas,
    totalCostUsd,
    daily: [],
    byModel: undefined,
    authSourceKey: "usage.claude.auth.personal.title",
  };
}

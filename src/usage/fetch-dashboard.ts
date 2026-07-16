import {
  attributeRunCosts,
  buildAttributionInsights,
  collectProviderQuotaAlerts,
  evaluateBudgetAlert,
  rangeWindowMs,
  sumAttributedCost,
  weekWindowMs,
} from "./attribution.js";
import { readUsageBudgetPrefs } from "./budget-store.js";
import { getUsageCredential, isUsageEncryptionAvailable, isUsageToolConfigured, listUsageCredentialStatus } from "./credential-store.js";
import { scanRecentFlowRunsForAttribution } from "./flow-run-scan.js";
import { fetchClaudeUsage } from "./providers/claude.js";
import { fetchCopilotUsage } from "./providers/copilot.js";
import { fetchCursorUsage } from "./providers/cursor.js";
import { fetchGeminiUsage } from "./providers/gemini.js";
import { fetchOpenAiUsage } from "./providers/openai.js";
import { aggregateUsageDashboard } from "./aggregate-daily.js";
import { USAGE_PROVIDERS } from "./registry.js";
import type { UsageCostInsights, UsageDashboardResult, UsageFetchOptions, UsageToolSnapshot } from "./types.js";

function buildCostInsights(tools: UsageToolSnapshot[], days: number): UsageCostInsights {
  const budget = readUsageBudgetPrefs();
  const runs = scanRecentFlowRunsForAttribution(500);
  const period = rangeWindowMs(days);
  const week = weekWindowMs();

  const periodAttr = attributeRunCosts(runs, tools, period.startMs, period.endMs);
  const weekAttr = attributeRunCosts(runs, tools, week.startMs, week.endMs);
  const periodInsights = buildAttributionInsights(periodAttr, tools);
  const weekInsights = buildAttributionInsights(weekAttr, tools);

  // Week spend prefers provider rollups for the 7-day window when daily data exists.
  const weekFromDaily = tools
    .filter((t) => t.status === "ok")
    .reduce((sum, t) => {
      const inWeek = t.daily
        .filter((d) => {
          const ms = Date.parse(`${d.date}T12:00:00.000Z`);
          return Number.isFinite(ms) && ms >= week.startMs && ms <= week.endMs;
        })
        .reduce((s, d) => s + d.costUsd, 0);
      return sum + inWeek;
    }, 0);
  const weekSpendUsd =
    weekFromDaily > 0 ? weekFromDaily : sumAttributedCost(weekAttr) || periodInsights.byTool.reduce((s, r) => s + r.costUsd, 0);

  const alert = evaluateBudgetAlert(weekSpendUsd, budget, collectProviderQuotaAlerts(tools));

  return {
    ...periodInsights,
    weekHottestFlow: weekInsights.hottestFlow,
    weekSpendUsd,
    budget,
    alert,
  };
}

async function fetchToolSnapshot(
  provider: (typeof USAGE_PROVIDERS)[number],
  days: number,
): Promise<UsageToolSnapshot> {
  const base: UsageToolSnapshot = {
    toolId: provider.toolId,
    label: provider.label,
    status: "unsupported",
    daily: [],
  };

  if (!provider.supported) {
    return {
      ...base,
      status: "unsupported",
      error: provider.unsupportedReason,
    };
  }

  if (!isUsageToolConfigured(provider.toolId)) {
    return { ...base, status: "not_configured" };
  }

  try {
    if (provider.toolId === "claude") {
      const data = await fetchClaudeUsage(
        {
          adminApiKey: getUsageCredential("claude", "adminApiKey"),
          sessionKey: getUsageCredential("claude", "sessionKey"),
          orgId: getUsageCredential("claude", "orgId"),
          cfClearance: getUsageCredential("claude", "cfClearance"),
        },
        days,
      );
      return { ...base, status: "ok", ...data };
    }
    if (provider.toolId === "codex") {
      const secret = getUsageCredential("codex", "adminApiKey");
      if (!secret?.trim()) return { ...base, status: "not_configured" };
      const data = await fetchOpenAiUsage(secret, days);
      return { ...base, status: "ok", ...data };
    }
    if (provider.toolId === "cursor") {
      const data = await fetchCursorUsage(
        {
          adminApiKey: getUsageCredential("cursor", "adminApiKey"),
          sessionToken: getUsageCredential("cursor", "sessionToken"),
        },
        days,
      );
      return {
        ...base,
        status: "ok",
        ...data,
      };
    }
    if (provider.toolId === "gemini") {
      const data = await fetchGeminiUsage(
        {
          apiKey: getUsageCredential("gemini", "apiKey"),
          serviceAccountJson: getUsageCredential("gemini", "serviceAccountJson"),
          projectId: getUsageCredential("gemini", "projectId"),
        },
        days,
      );
      return { ...base, status: "ok", ...data };
    }
    if (provider.toolId === "copilot") {
      const data = await fetchCopilotUsage(
        {
          pat: getUsageCredential("copilot", "pat"),
          org: getUsageCredential("copilot", "org"),
          enterprise: getUsageCredential("copilot", "enterprise"),
        },
        days,
      );
      return { ...base, status: "ok", ...data };
    }
    return { ...base, status: "unsupported", error: provider.unsupportedReason };
  } catch (err: unknown) {
    return {
      ...base,
      status: "error",
      error: (err as Error).message,
    };
  }
}

export async function fetchUsageDashboard(opts: UsageFetchOptions = {}): Promise<UsageDashboardResult> {
  const days = Math.min(Math.max(opts.days ?? 30, 1), 90);
  const statuses = listUsageCredentialStatus();

  const tools = await Promise.all(
    USAGE_PROVIDERS.map((provider) => fetchToolSnapshot(provider, days)),
  );

  const supported = USAGE_PROVIDERS.filter((p) => p.supported);
  const configuredCount = statuses.filter((s) => s.configured).length;

  return {
    rangeDays: days,
    fetchedAt: new Date().toISOString(),
    encryptionAvailable: isUsageEncryptionAvailable(),
    tools,
    summary: aggregateUsageDashboard(tools, configuredCount, supported.length),
    insights: buildCostInsights(tools, days),
  };
}

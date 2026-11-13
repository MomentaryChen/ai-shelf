import {
  buildAttributionInsights,
  collectProviderQuotaAlerts,
  evaluateBudgetAlert,
  weekSpendUsdFromTools,
  weekWindowMs,
} from "./attribution.js";
import { readUsageBudgetPrefs } from "./budget-store.js";
import {
  getUsageCredential,
  isUsageEncryptionAvailable,
  isUsageToolConfigured,
} from "./credential-store.js";
import { fetchClaudeUsage } from "./providers/claude.js";
import { fetchCopilotUsage } from "./providers/copilot.js";
import { fetchCrushUsage } from "./providers/crush.js";
import { fetchCursorUsage } from "./providers/cursor.js";
import { fetchGeminiUsage } from "./providers/gemini.js";
import { fetchGooseUsage } from "./providers/goose.js";
import type { LocalUsageResult } from "./providers/local-usage.js";
import { fetchOpencodeUsage } from "./providers/opencode.js";
import { fetchOpenAiUsage } from "./providers/openai.js";
import { LocalUsageNotFoundError } from "./local-sqlite.js";
import { aggregateUsageDashboard } from "./aggregate-daily.js";
import { USAGE_PROVIDERS } from "./registry.js";
import type {
  UsageCostInsights,
  UsageDashboardResult,
  UsageFetchOptions,
  UsageToolId,
  UsageToolSnapshot,
} from "./types.js";

/** Providers that read the tool's own session data on disk — no credentials involved. */
const LOCAL_USAGE_READERS: Partial<
  Record<UsageToolId, (days: number) => Promise<LocalUsageResult>>
> = {
  opencode: fetchOpencodeUsage,
  crush: fetchCrushUsage,
  goose: fetchGooseUsage,
};

function buildCostInsights(tools: UsageToolSnapshot[]): UsageCostInsights {
  const budget = readUsageBudgetPrefs();
  const week = weekWindowMs();
  const periodInsights = buildAttributionInsights(tools);

  // Week spend comes from provider rollups for the 7-day window. Never fall back to
  // the whole-period total — that inflates "this week" by up to the full range
  // (e.g. 30 days) and trips false budget alerts.
  const weekSpendUsd = weekSpendUsdFromTools(tools, week);

  const alert = evaluateBudgetAlert(weekSpendUsd, budget, collectProviderQuotaAlerts(tools));

  return {
    ...periodInsights,
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
      messageKey: provider.unsupportedReasonKey,
    };
  }

  const localReader =
    provider.dataSource === "local" ? LOCAL_USAGE_READERS[provider.toolId] : undefined;
  if (localReader) {
    try {
      const data = await localReader(days);
      return { ...base, status: "ok", authSourceKey: "usage.local.source", ...data };
    } catch (err: unknown) {
      if (err instanceof LocalUsageNotFoundError) {
        return {
          ...base,
          status: "not_configured",
          messageKey: "usage.local.notFound",
          statusKey: "usage.status.noLocalData",
        };
      }
      return { ...base, status: "error", error: (err as Error).message };
    }
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

export async function fetchUsageDashboard(
  opts: UsageFetchOptions = {},
): Promise<UsageDashboardResult> {
  const days = Math.min(Math.max(opts.days ?? 30, 1), 90);

  const tools = await Promise.all(
    USAGE_PROVIDERS.map((provider) => fetchToolSnapshot(provider, days)),
  );

  return {
    rangeDays: days,
    fetchedAt: new Date().toISOString(),
    encryptionAvailable: isUsageEncryptionAvailable(),
    tools,
    summary: aggregateUsageDashboard(tools),
    insights: buildCostInsights(tools),
  };
}

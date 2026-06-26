import { getUsageCredential, isUsageEncryptionAvailable, isUsageToolConfigured, listUsageCredentialStatus } from "./credential-store.js";
import { fetchClaudeUsage } from "./providers/claude.js";
import { fetchCopilotUsage } from "./providers/copilot.js";
import { fetchCursorUsage } from "./providers/cursor.js";
import { fetchGeminiUsage } from "./providers/gemini.js";
import { fetchOpenAiUsage } from "./providers/openai.js";
import { USAGE_PROVIDERS } from "./registry.js";
import type { UsageDashboardResult, UsageFetchOptions, UsageToolSnapshot } from "./types.js";

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
  const totalCostUsd = tools
    .filter((t) => t.status === "ok")
    .reduce((sum, t) => sum + (t.totalCostUsd ?? 0), 0);

  return {
    rangeDays: days,
    fetchedAt: new Date().toISOString(),
    encryptionAvailable: isUsageEncryptionAvailable(),
    tools,
    summary: {
      totalCostUsd,
      configuredCount: statuses.filter((s) => s.configured).length,
      supportedCount: supported.length,
    },
  };
}

import type { UsageToolSnapshot } from "../types.js";
import { fetchGeminiGcpQuotas, testGeminiApiKey, testGeminiGcpCredentials } from "./gemini-gcp.js";

export type GeminiUsageAuthSource =
  | "usage.gemini.auth.gcp.title"
  | "usage.gemini.auth.apiKey.title";

export async function fetchGeminiUsage(
  creds: {
    apiKey?: string | null;
    serviceAccountJson?: string | null;
    projectId?: string | null;
  },
  _days: number,
): Promise<
  Pick<
    UsageToolSnapshot,
    "daily" | "byModel" | "totalCostUsd" | "totalInputTokens" | "totalOutputTokens" | "quotas"
  > & { authSourceKey: GeminiUsageAuthSource }
> {
  const saJson = creds.serviceAccountJson?.trim();
  const apiKey = creds.apiKey?.trim();

  if (saJson) {
    const data = await fetchGeminiGcpQuotas(saJson, creds.projectId);
    return { ...data, authSourceKey: "usage.gemini.auth.gcp.title" };
  }

  if (apiKey) {
    await testGeminiApiKey(apiKey);
    throw new Error("API key is valid but usage requires a GCP service account with Monitoring access");
  }

  throw new Error("No Gemini credentials configured");
}

export { testGeminiApiKey, testGeminiGcpCredentials };

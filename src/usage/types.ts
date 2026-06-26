/** Tools with usage/cost API integration in AI Shelf. */
export type UsageToolId = "claude" | "codex" | "cursor" | "gemini" | "copilot";

export interface UsageCredentialFieldMeta {
  key: string;
  label: string;
  labelKey?: string;
  groupKey?: string;
  groupLabelKey?: string;
  noteKey?: string;
  placeholder?: string;
  helpUrl?: string;
  helpLinkKey?: string;
}

export interface UsageProviderMeta {
  toolId: UsageToolId;
  label: string;
  supported: boolean;
  unsupportedReason?: string;
  credentialNoteKey?: string;
  docsUrl?: string;
  fields: UsageCredentialFieldMeta[];
}

export interface UsageCredentialStatus {
  toolId: UsageToolId;
  configured: boolean;
  maskedHint?: string;
  methods?: Array<{ fieldKey: string; labelKey: string; maskedHint?: string }>;
}

export interface UsageDayBucket {
  date: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface UsageModelBreakdown {
  model: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface UsageQuotaWindow {
  key: string;
  labelKey: string;
  /** When set, shown instead of i18n labelKey (e.g. dynamic GCP metric names). */
  label?: string;
  usedPercent: number;
  resetAt?: string;
}

export interface UsageToolSnapshot {
  toolId: UsageToolId;
  label: string;
  status: "ok" | "not_configured" | "unsupported" | "error";
  error?: string;
  authSourceKey?: string;
  totalCostUsd?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  daily: UsageDayBucket[];
  byModel?: UsageModelBreakdown[];
  quotas?: UsageQuotaWindow[];
}

export interface UsageDashboardResult {
  rangeDays: number;
  fetchedAt: string;
  encryptionAvailable: boolean;
  tools: UsageToolSnapshot[];
  summary: {
    totalCostUsd: number;
    configuredCount: number;
    supportedCount: number;
  };
}

export interface UsageFetchOptions {
  days?: number;
}

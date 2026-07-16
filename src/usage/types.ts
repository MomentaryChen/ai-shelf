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

export interface UsageDailyToolSlice {
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** Per-day rollup across all configured tools with cost/token data. */
export interface UsageDailyUnifiedRow {
  date: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  byTool: Partial<Record<UsageToolId, UsageDailyToolSlice>>;
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
  /** Dollar budget fields from providers like Cursor spending summary. */
  usedUsd?: number;
  limitUsd?: number;
  remainingUsd?: number;
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

export interface UsageAttributionRow {
  id: string;
  label: string;
  costUsd: number;
  runCount: number;
  /** True when cost was inferred from tool spend × duration share. */
  estimated: boolean;
  toolId?: UsageToolId;
  durationMs: number;
}

export interface UsageHottestFlow {
  flowId: string;
  label: string;
  costUsd: number;
  runCount: number;
  estimated: boolean;
}

export interface UsageBudgetAlert {
  level: "ok" | "warn" | "over";
  weekSpendUsd: number;
  weeklyBudgetUsd: number | null;
  alertAtPercent: number;
  usedPercent: number;
  messageKey: "usage.budget.ok" | "usage.budget.warn" | "usage.budget.over" | "usage.budget.quotaWarn";
  quotaAlerts: Array<{
    toolId: UsageToolId;
    labelKey: string;
    label?: string;
    usedPercent: number;
  }>;
}

export interface UsageBudgetPrefs {
  weeklyBudgetUsd: number | null;
  alertAtPercent: number;
}

export interface UsageCostInsights {
  byTool: UsageAttributionRow[];
  byProfile: UsageAttributionRow[];
  byFlow: UsageAttributionRow[];
  hottestFlow: UsageHottestFlow | null;
  /** Always last 7 UTC days — for the "this week" decision card. */
  weekHottestFlow: UsageHottestFlow | null;
  weekSpendUsd: number;
  budget: UsageBudgetPrefs;
  alert: UsageBudgetAlert;
}

export interface UsageDashboardResult {
  rangeDays: number;
  fetchedAt: string;
  encryptionAvailable: boolean;
  tools: UsageToolSnapshot[];
  summary: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    configuredCount: number;
    supportedCount: number;
    dailyUnified: UsageDailyUnifiedRow[];
  };
  insights: UsageCostInsights;
}

export interface UsageFetchOptions {
  days?: number;
}

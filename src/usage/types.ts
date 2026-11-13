/** Tools with usage/cost API integration in AI Shelf. */
export type UsageToolId =
  | "claude"
  | "codex"
  | "cursor"
  | "gemini"
  | "copilot"
  | "opencode"
  | "crush"
  | "goose"
  | "aider";

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
  /** "api" (default) needs credentials; "local" reads the tool's own session data on disk. */
  dataSource?: "api" | "local";
  unsupportedReason?: string;
  /** i18n key explaining why no usage source exists (shown instead of unsupportedReason). */
  unsupportedReasonKey?: string;
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
  /** Unit counts for provider quotas (e.g. Gemini requests vs published limit). */
  usedCount?: number;
  limitCount?: number;
}

export interface UsageToolSnapshot {
  toolId: UsageToolId;
  label: string;
  status: "ok" | "not_configured" | "unsupported" | "error";
  error?: string;
  authSourceKey?: string;
  /** i18n key for the not_configured / unsupported explanation (e.g. local data not found). */
  messageKey?: string;
  /** i18n key overriding the short status label in the comparison table. */
  statusKey?: string;
  /** Overrides the default per-tool quota hint in the usage panel. */
  quotaHintKey?: string;
  totalCostUsd?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  /**
   * Provider-measured spend for the last 7 UTC days.
   * Used when daily rows have tokens but no dollars (Cursor included usage).
   */
  weekCostUsd?: number;
  /**
   * What `totalCostUsd` covers. "period" (default) = the selected date range.
   * "billingCycle" = the provider's current billing cycle (e.g. claude.ai extra-usage
   * credits); kept out of the period total so different windows are not mixed.
   */
  costScope?: "period" | "billingCycle";
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

export interface UsageBudgetAlert {
  level: "ok" | "warn" | "over";
  weekSpendUsd: number;
  weeklyBudgetUsd: number | null;
  alertAtPercent: number;
  usedPercent: number;
  messageKey:
    | "usage.budget.ok"
    | "usage.budget.warn"
    | "usage.budget.over"
    | "usage.budget.quotaWarn";
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
    /** Sum of period-scoped tool costs for the selected range. */
    totalCostUsd: number;
    /** Billing-cycle spend reported by tools without a per-period figure (not in totalCostUsd). */
    billingCycleCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    /** Supported tools that are connected: API credentials saved, or local session data found. */
    configuredCount: number;
    /** Every tool AI Shelf can read usage for (API + local). */
    supportedCount: number;
    /** Connected tools that returned cost, tokens or a quota snapshot for this period. */
    activeCount: number;
    dailyUnified: UsageDailyUnifiedRow[];
  };
  insights: UsageCostInsights;
}

export interface UsageFetchOptions {
  days?: number;
}

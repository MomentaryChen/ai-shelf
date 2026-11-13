import type { UsageDashboardResult, UsageToolId } from "./types";

/** Fixed threshold for the once-a-day billing reminder (independent of the budget alert %). */
export const BILLING_ALERT_PERCENT = 90;

const STORAGE_KEY = "ai-shelf.usage.billingAlertShownDay";

/**
 * Quotas that only exist when the user turned on pay-as-you-go billing.
 * Cursor on-demand without a spend limit reports 100% as soon as anything is spent,
 * so those only count when a dollar limit is known.
 */
const BILLING_QUOTA_KEYS: Record<string, { requiresLimit: boolean }> = {
  extra_usage: { requiresLimit: false },
  "cursor-on-demand": { requiresLimit: true },
  "cursor-team-on-demand": { requiresLimit: true },
};

export type BillingAlertItem =
  | { kind: "weeklyBudget"; usedPercent: number }
  | { kind: "quota"; toolId: UsageToolId; toolLabel: string; labelKey: string; label?: string; usedPercent: number };

export function evaluateBillingAlert(
  dashboard: Pick<UsageDashboardResult, "tools" | "insights">,
  threshold = BILLING_ALERT_PERCENT,
): BillingAlertItem[] {
  const items: BillingAlertItem[] = [];

  const { weeklyBudgetUsd } = dashboard.insights.budget;
  if (weeklyBudgetUsd != null && weeklyBudgetUsd > 0) {
    const pct = (dashboard.insights.weekSpendUsd / weeklyBudgetUsd) * 100;
    if (pct >= threshold) items.push({ kind: "weeklyBudget", usedPercent: Math.round(pct) });
  }

  for (const tool of dashboard.tools) {
    if (tool.status !== "ok") continue;
    for (const q of tool.quotas ?? []) {
      const rule = BILLING_QUOTA_KEYS[q.key];
      if (!rule) continue;
      if (rule.requiresLimit && !(q.limitUsd != null && q.limitUsd > 0)) continue;
      if (q.usedPercent < threshold) continue;
      items.push({
        kind: "quota",
        toolId: tool.toolId,
        toolLabel: tool.label,
        labelKey: q.labelKey,
        label: q.label,
        usedPercent: Math.round(q.usedPercent),
      });
    }
  }

  return items.sort((a, b) => b.usedPercent - a.usedPercent);
}

/** Local calendar day, so "once a day" follows the user's clock rather than UTC. */
export function localDayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function wasBillingAlertShownToday(now = new Date()): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === localDayKey(now);
  } catch {
    return false;
  }
}

export function markBillingAlertShown(now = new Date()): void {
  try {
    localStorage.setItem(STORAGE_KEY, localDayKey(now));
  } catch {
    /* storage unavailable — worst case the reminder shows again this session */
  }
}

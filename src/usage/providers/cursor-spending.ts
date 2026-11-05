import type { UsageQuotaWindow } from "../types.js";

interface CursorPlanUsage {
  enabled?: boolean;
  used?: number;
  limit?: number | null;
  remaining?: number | null;
  breakdown?: {
    included?: number;
    bonus?: number;
    total?: number;
  };
  autoPercentUsed?: number;
  apiPercentUsed?: number;
  totalPercentUsed?: number;
}

interface CursorOnDemandUsage {
  enabled?: boolean;
  used?: number;
  limit?: number | null;
  remaining?: number | null;
}

export interface CursorUsageSummaryResponse {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  isUnlimited?: boolean;
  individualUsage?: {
    plan?: CursorPlanUsage;
    onDemand?: CursorOnDemandUsage;
  };
  teamUsage?: {
    onDemand?: CursorOnDemandUsage;
  };
}

interface CursorTeamMemberSpend {
  userId?: number;
  name?: string;
  email?: string;
  spendCents?: number;
  overallSpendCents?: number;
  includedSpendCents?: number;
  apiPercentUsed?: number;
  totalPercentUsed?: number;
  autoPercentUsed?: number;
  monthlyLimitDollars?: number | null;
}

export interface CursorTeamSpendResponse {
  teamMemberSpend?: CursorTeamMemberSpend[];
  subscriptionCycleStart?: number;
  totalMembers?: number;
}

function asNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * `usage-summary` plan `used` / `limit` / `remaining` are cents
 * (1207 = $12.07). Dividing only values ≥ 500 mixed units on the same row
 * ("$450 remaining of $20") whenever a small balance sat under that cutoff.
 */
function centsToUsd(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return value / 100;
}

function planAmountsToUsd(
  used?: number,
  limit?: number,
  remaining?: number,
): {
  usedUsd?: number;
  limitUsd?: number;
  remainingUsd?: number;
} {
  return {
    usedUsd: centsToUsd(used),
    limitUsd: centsToUsd(limit),
    remainingUsd: centsToUsd(remaining),
  };
}

function pushPercentQuota(
  quotas: UsageQuotaWindow[],
  key: string,
  labelKey: string,
  usedPercent: number | undefined,
  resetAt: string | undefined,
  amounts?: { usedUsd?: number; limitUsd?: number; remainingUsd?: number },
  label?: string,
): void {
  if (usedPercent == null || !Number.isFinite(usedPercent)) return;
  quotas.push({
    key,
    labelKey,
    label,
    usedPercent: clampPercent(usedPercent),
    resetAt,
    ...amounts,
  });
}

export function quotasFromUsageSummary(summary: CursorUsageSummaryResponse): UsageQuotaWindow[] {
  const quotas: UsageQuotaWindow[] = [];
  const resetAt = summary.billingCycleEnd;
  const plan = summary.individualUsage?.plan;

  if (plan?.enabled) {
    const amounts = planAmountsToUsd(
      asNumber(plan.used),
      asNumber(plan.limit ?? undefined),
      asNumber(plan.remaining ?? undefined),
    );

    pushPercentQuota(
      quotas,
      "cursor-total",
      "usage.cursor.quota.total",
      asNumber(plan.totalPercentUsed),
      resetAt,
      amounts,
    );
    pushPercentQuota(
      quotas,
      "cursor-api",
      "usage.cursor.quota.api",
      asNumber(plan.apiPercentUsed),
      resetAt,
    );
    pushPercentQuota(
      quotas,
      "cursor-auto",
      "usage.cursor.quota.auto",
      asNumber(plan.autoPercentUsed),
      resetAt,
    );

    if (
      quotas.length === 0 &&
      amounts.limitUsd != null &&
      amounts.limitUsd > 0 &&
      amounts.usedUsd != null
    ) {
      const usedPercent = (amounts.usedUsd / amounts.limitUsd) * 100;
      quotas.push({
        key: "cursor-included",
        labelKey: "usage.cursor.quota.included",
        usedPercent: clampPercent(usedPercent),
        resetAt,
        ...amounts,
      });
    }
  }

  const onDemand = summary.individualUsage?.onDemand;
  if (onDemand?.enabled) {
    const usedCents = asNumber(onDemand.used) ?? 0;
    const limitCents = asNumber(onDemand.limit ?? undefined);
    const remainingCents = asNumber(onDemand.remaining ?? undefined);
    const usedUsd = usedCents / 100;
    const limitUsd = limitCents != null ? limitCents / 100 : undefined;
    const remainingUsd = remainingCents != null ? remainingCents / 100 : undefined;
    const usedPercent =
      limitUsd != null && limitUsd > 0 ? (usedUsd / limitUsd) * 100 : usedUsd > 0 ? 100 : 0;

    quotas.push({
      key: "cursor-on-demand",
      labelKey: "usage.cursor.quota.onDemand",
      usedPercent: clampPercent(usedPercent),
      resetAt,
      usedUsd,
      limitUsd,
      remainingUsd,
    });
  }

  const teamOnDemand = summary.teamUsage?.onDemand;
  if (teamOnDemand?.enabled && (asNumber(teamOnDemand.used) ?? 0) > 0) {
    const usedCents = asNumber(teamOnDemand.used) ?? 0;
    const limitCents = asNumber(teamOnDemand.limit ?? undefined);
    const remainingCents = asNumber(teamOnDemand.remaining ?? undefined);
    const usedUsd = usedCents / 100;
    const limitUsd = limitCents != null ? limitCents / 100 : undefined;
    const remainingUsd = remainingCents != null ? remainingCents / 100 : undefined;
    const usedPercent =
      limitUsd != null && limitUsd > 0 ? (usedUsd / limitUsd) * 100 : usedUsd > 0 ? 100 : 0;

    quotas.push({
      key: "cursor-team-on-demand",
      labelKey: "usage.cursor.quota.teamOnDemand",
      usedPercent: clampPercent(usedPercent),
      resetAt,
      usedUsd,
      limitUsd,
      remainingUsd,
    });
  }

  return quotas.sort((a, b) => b.usedPercent - a.usedPercent);
}

export interface CursorCurrentPeriodUsage {
  billingCycleStart?: string | number;
  billingCycleEnd?: string | number;
  planUsage?: {
    totalSpend?: number;
    includedSpend?: number;
    bonusSpend?: number;
    limit?: number;
    autoPercentUsed?: number;
    apiPercentUsed?: number;
    totalPercentUsed?: number;
  };
  spendLimitUsage?: {
    individualLimit?: number | null;
    individualRemaining?: number | null;
    individualUsed?: number | null;
    pooledLimit?: number | null;
    pooledUsed?: number | null;
    pooledRemaining?: number | null;
  };
}

/** Billing-cycle timestamps arrive as ISO strings or epoch milliseconds (sometimes seconds). */
export function cursorCycleTimestampToIso(value: string | number | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string" && value.includes("T")) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const ms = n < 1e12 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

/**
 * Dollars and percents from `POST /api/dashboard/get-current-period-usage`.
 * Spend fields are cents. Percent fields are already 0–100 and are not the same ratio as spend/limit,
 * so dollar amounts stay on the spend row instead of being copied onto every percent bar.
 */
export function quotasFromCurrentPeriodUsage(
  data: CursorCurrentPeriodUsage | null | undefined,
): UsageQuotaWindow[] {
  if (!data) return [];
  const quotas: UsageQuotaWindow[] = [];
  const resetAt = cursorCycleTimestampToIso(data.billingCycleEnd);
  const plan = data.planUsage;

  if (plan) {
    const usedCents = asNumber(plan.totalSpend);
    const limitCents = asNumber(plan.limit);
    const usedUsd = centsToUsd(usedCents);
    const limitUsd = centsToUsd(limitCents);
    // A missing cap is not "100% used". Percent bars below cover that case.
    if (limitUsd != null && limitUsd > 0) {
      const used = usedUsd ?? 0;
      quotas.push({
        key: "cursor-plan-spend",
        labelKey: "usage.cursor.quota.included",
        usedPercent: clampPercent((used / limitUsd) * 100),
        resetAt,
        usedUsd: used,
        limitUsd,
        remainingUsd: Math.max(0, limitUsd - used),
      });
    }

    pushPercentQuota(
      quotas,
      "cursor-period-total",
      "usage.cursor.quota.total",
      asNumber(plan.totalPercentUsed),
      resetAt,
    );
    pushPercentQuota(
      quotas,
      "cursor-period-api",
      "usage.cursor.quota.api",
      asNumber(plan.apiPercentUsed),
      resetAt,
    );
    pushPercentQuota(
      quotas,
      "cursor-period-auto",
      "usage.cursor.quota.auto",
      asNumber(plan.autoPercentUsed),
      resetAt,
    );
  }

  const spend = data.spendLimitUsage;
  if (spend) {
    const limitCents = asNumber(spend.individualLimit ?? undefined);
    const remainingCents = asNumber(spend.individualRemaining ?? undefined);
    const usedCents =
      asNumber(spend.individualUsed ?? undefined) ??
      (limitCents != null && remainingCents != null
        ? Math.max(0, limitCents - remainingCents)
        : undefined);
    const pooledUsed = asNumber(spend.pooledUsed ?? undefined);
    const used = usedCents ?? pooledUsed;
    const limit = limitCents ?? asNumber(spend.pooledLimit ?? undefined);
    const remaining = remainingCents ?? asNumber(spend.pooledRemaining ?? undefined);
    if ((used != null && used > 0) || (limit != null && limit > 0)) {
      const usedUsd = centsToUsd(used) ?? 0;
      const limitUsd = centsToUsd(limit);
      const remainingUsd = centsToUsd(remaining);
      const usedPercent =
        limitUsd != null && limitUsd > 0 ? (usedUsd / limitUsd) * 100 : usedUsd > 0 ? 100 : 0;
      quotas.push({
        key: "cursor-on-demand",
        labelKey: "usage.cursor.quota.onDemand",
        usedPercent: clampPercent(usedPercent),
        resetAt,
        usedUsd,
        limitUsd,
        remainingUsd,
      });
    }
  }

  return quotas
    .filter((q) => q.usedPercent > 0 || (q.usedUsd ?? 0) > 0 || (q.limitUsd ?? 0) > 0)
    .sort((a, b) => b.usedPercent - a.usedPercent);
}

function cycleEndFromStart(startMs: number): string {
  const start = new Date(startMs);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}

export function quotasFromTeamSpend(data: CursorTeamSpendResponse): UsageQuotaWindow[] {
  const members = data.teamMemberSpend ?? [];
  if (members.length === 0) return [];

  const resetAt =
    data.subscriptionCycleStart != null
      ? cycleEndFromStart(data.subscriptionCycleStart)
      : undefined;

  const quotas: UsageQuotaWindow[] = [];

  const withPercents = members.filter(
    (m) =>
      asNumber(m.totalPercentUsed) != null ||
      asNumber(m.apiPercentUsed) != null ||
      asNumber(m.autoPercentUsed) != null,
  );

  const ranked = (withPercents.length > 0 ? withPercents : members)
    .slice()
    .sort(
      (a, b) =>
        (asNumber(b.totalPercentUsed) ?? asNumber(b.apiPercentUsed) ?? 0) -
        (asNumber(a.totalPercentUsed) ?? asNumber(a.apiPercentUsed) ?? 0),
    )
    .slice(0, 5);

  for (const member of ranked) {
    const label = member.name?.trim() || member.email?.trim() || `User ${member.userId ?? ""}`;
    const includedUsd =
      asNumber(member.includedSpendCents) != null
        ? (asNumber(member.includedSpendCents) ?? 0) / 100
        : undefined;
    const limitUsd = asNumber(member.monthlyLimitDollars ?? undefined);

    pushPercentQuota(
      quotas,
      `team-${member.userId ?? label}-total`,
      "usage.cursor.quota.total",
      asNumber(member.totalPercentUsed),
      resetAt,
      includedUsd != null || limitUsd != null
        ? {
            usedUsd: includedUsd,
            limitUsd,
            remainingUsd:
              limitUsd != null && includedUsd != null
                ? Math.max(0, limitUsd - includedUsd)
                : undefined,
          }
        : undefined,
      label,
    );
    pushPercentQuota(
      quotas,
      `team-${member.userId ?? label}-api`,
      "usage.cursor.quota.api",
      asNumber(member.apiPercentUsed),
      resetAt,
      undefined,
      label,
    );
  }

  if (quotas.length === 0) {
    const totalSpendCents = members.reduce(
      (sum, m) => sum + (asNumber(m.overallSpendCents) ?? 0),
      0,
    );
    const totalOnDemandCents = members.reduce((sum, m) => sum + (asNumber(m.spendCents) ?? 0), 0);
    if (totalSpendCents > 0) {
      quotas.push({
        key: "team-overall-spend",
        labelKey: "usage.cursor.quota.teamSpend",
        usedUsd: totalSpendCents / 100,
        usedPercent: 100,
        resetAt,
      });
    }
    if (totalOnDemandCents > 0 && totalOnDemandCents !== totalSpendCents) {
      quotas.push({
        key: "team-on-demand-spend",
        labelKey: "usage.cursor.quota.onDemand",
        usedUsd: totalOnDemandCents / 100,
        usedPercent: 100,
        resetAt,
      });
    }
  }

  return quotas;
}

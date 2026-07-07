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

/** Cursor plan counters are usually cents; fall back to raw values when already dollar-sized. */
function planAmountsToUsd(used?: number, limit?: number, remaining?: number): {
  usedUsd?: number;
  limitUsd?: number;
  remainingUsd?: number;
} {
  const toUsd = (value: number | undefined): number | undefined => {
    if (value == null) return undefined;
    if (value > 0 && value < 500) return value;
    return value / 100;
  };
  return {
    usedUsd: toUsd(used),
    limitUsd: toUsd(limit),
    remainingUsd: toUsd(remaining),
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
      amounts,
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
    const totalSpendCents = members.reduce((sum, m) => sum + (asNumber(m.overallSpendCents) ?? 0), 0);
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

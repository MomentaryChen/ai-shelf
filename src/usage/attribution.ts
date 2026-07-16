import { canonicalToolId } from "../tools.js";
import type { FlowRunState } from "../shared/flow-types.js";
import type {
  UsageAttributionRow,
  UsageBudgetAlert,
  UsageBudgetPrefs,
  UsageCostInsights,
  UsageToolId,
  UsageToolSnapshot,
} from "./types.js";

const USAGE_TOOL_IDS: UsageToolId[] = ["claude", "codex", "cursor", "gemini", "copilot"];

export type AttributionRunInput = Pick<
  FlowRunState,
  | "runId"
  | "flowId"
  | "status"
  | "startedAt"
  | "updatedAt"
  | "completedAt"
  | "profileId"
  | "agentTool"
  | "costUsd"
  | "costEstimated"
>;

function isUsageToolId(id: string): id is UsageToolId {
  return (USAGE_TOOL_IDS as string[]).includes(id);
}

export function usageToolFromAgent(agentTool?: string | null): UsageToolId | null {
  if (!agentTool?.trim()) return null;
  const id = canonicalToolId(agentTool.trim());
  return isUsageToolId(id) ? id : null;
}

function runEndMs(run: AttributionRunInput): number {
  const iso = run.completedAt ?? run.updatedAt ?? run.startedAt;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function runStartMs(run: AttributionRunInput): number {
  const t = Date.parse(run.startedAt);
  return Number.isFinite(t) ? t : 0;
}

function runDurationMs(run: AttributionRunInput): number {
  const start = runStartMs(run);
  const end = runEndMs(run);
  if (start <= 0 || end <= 0 || end < start) return 0;
  return Math.max(0, end - start);
}

function inRange(run: AttributionRunInput, rangeStartMs: number, rangeEndMs: number): boolean {
  const start = runStartMs(run);
  if (start <= 0) return false;
  return start >= rangeStartMs && start <= rangeEndMs;
}

function toolCostMap(tools: UsageToolSnapshot[]): Map<UsageToolId, number> {
  const map = new Map<UsageToolId, number>();
  for (const tool of tools) {
    if (tool.status !== "ok") continue;
    const cost = tool.totalCostUsd ?? 0;
    if (cost > 0) map.set(tool.toolId, cost);
  }
  return map;
}

type MutableRow = {
  id: string;
  label: string;
  costUsd: number;
  runCount: number;
  measuredCostUsd: number;
  estimatedCostUsd: number;
  durationMs: number;
  toolId?: UsageToolId;
};

function bumpRow(
  map: Map<string, MutableRow>,
  id: string,
  label: string,
  costUsd: number,
  estimated: boolean,
  durationMs: number,
  toolId?: UsageToolId,
): void {
  const row = map.get(id) ?? {
    id,
    label,
    costUsd: 0,
    runCount: 0,
    measuredCostUsd: 0,
    estimatedCostUsd: 0,
    durationMs: 0,
    toolId,
  };
  row.costUsd += costUsd;
  row.runCount += 1;
  row.durationMs += durationMs;
  if (estimated) row.estimatedCostUsd += costUsd;
  else row.measuredCostUsd += costUsd;
  if (toolId) row.toolId = toolId;
  map.set(id, row);
}

function finalizeRows(map: Map<string, MutableRow>, limit = 12): UsageAttributionRow[] {
  return [...map.values()]
    .map((row) => ({
      id: row.id,
      label: row.label,
      costUsd: row.costUsd,
      runCount: row.runCount,
      estimated: row.estimatedCostUsd > 0 && row.measuredCostUsd <= 0,
      toolId: row.toolId,
      durationMs: row.durationMs,
    }))
    .sort(
      (a, b) =>
        b.costUsd - a.costUsd ||
        b.runCount - a.runCount ||
        b.durationMs - a.durationMs ||
        a.label.localeCompare(b.label),
    )
    .slice(0, limit);
}

/**
 * Attribute provider tool spend onto Flow runs in a window.
 * Prefer measured costUsd on the run; otherwise share the matching tool's
 * period total by run duration among unmeasured runs.
 */
export function attributeRunCosts(
  runs: AttributionRunInput[],
  tools: UsageToolSnapshot[],
  rangeStartMs: number,
  rangeEndMs: number,
): Array<AttributionRunInput & { attributedCostUsd: number; estimated: boolean; toolId: UsageToolId | null }> {
  const windowRuns = runs.filter(
    (r) =>
      (r.status === "completed" || r.status === "failed" || r.status === "cancelled") &&
      inRange(r, rangeStartMs, rangeEndMs),
  );

  const costs = toolCostMap(tools);
  const measured = new Set<string>();
  const attributed: Array<
    AttributionRunInput & { attributedCostUsd: number; estimated: boolean; toolId: UsageToolId | null }
  > = [];

  for (const run of windowRuns) {
    const toolId = usageToolFromAgent(run.agentTool);
    const measuredCost =
      run.costUsd != null && Number.isFinite(run.costUsd) && run.costUsd > 0 && !run.costEstimated
        ? run.costUsd
        : null;
    if (measuredCost != null) {
      measured.add(run.runId);
      attributed.push({
        ...run,
        attributedCostUsd: measuredCost,
        estimated: false,
        toolId,
      });
    }
  }

  // Remaining tool budget after measured runs.
  const remaining = new Map(costs);
  for (const row of attributed) {
    if (!row.toolId || row.estimated) continue;
    const left = (remaining.get(row.toolId) ?? 0) - row.attributedCostUsd;
    remaining.set(row.toolId, Math.max(0, left));
  }

  const unmeasuredByTool = new Map<UsageToolId, AttributionRunInput[]>();
  for (const run of windowRuns) {
    if (measured.has(run.runId)) continue;
    const toolId = usageToolFromAgent(run.agentTool);
    if (!toolId) {
      attributed.push({ ...run, attributedCostUsd: 0, estimated: true, toolId: null });
      continue;
    }
    const list = unmeasuredByTool.get(toolId) ?? [];
    list.push(run);
    unmeasuredByTool.set(toolId, list);
  }

  for (const [toolId, group] of unmeasuredByTool) {
    const budget = remaining.get(toolId) ?? 0;
    const durations = group.map((r) => Math.max(runDurationMs(r), 1_000));
    const totalDur = durations.reduce((s, d) => s + d, 0);
    group.forEach((run, i) => {
      const share = budget > 0 && totalDur > 0 ? (budget * durations[i]!) / totalDur : 0;
      attributed.push({
        ...run,
        attributedCostUsd: share,
        estimated: share > 0 || budget === 0,
        toolId,
      });
    });
  }

  return attributed;
}

export function buildAttributionInsights(
  attributed: Array<
    AttributionRunInput & { attributedCostUsd: number; estimated: boolean; toolId: UsageToolId | null }
  >,
  tools: UsageToolSnapshot[],
): Pick<UsageCostInsights, "byTool" | "byProfile" | "byFlow" | "hottestFlow"> {
  const byToolMap = new Map<string, MutableRow>();
  const byProfileMap = new Map<string, MutableRow>();
  const byFlowMap = new Map<string, MutableRow>();

  for (const tool of tools) {
    if (tool.status !== "ok") continue;
    const cost = tool.totalCostUsd ?? 0;
    if (cost <= 0 && (tool.totalInputTokens ?? 0) <= 0) continue;
    // Seed tool rows with provider totals; run counts added below.
    const row = byToolMap.get(tool.toolId) ?? {
      id: tool.toolId,
      label: tool.label,
      costUsd: 0,
      runCount: 0,
      measuredCostUsd: 0,
      estimatedCostUsd: 0,
      durationMs: 0,
      toolId: tool.toolId,
    };
    row.costUsd = cost;
    row.measuredCostUsd = cost;
    byToolMap.set(tool.toolId, row);
  }

  for (const run of attributed) {
    const flowLabel = run.flowId;
    bumpRow(
      byFlowMap,
      run.flowId,
      flowLabel,
      run.attributedCostUsd,
      run.estimated,
      runDurationMs(run),
      run.toolId ?? undefined,
    );

    const profileId = run.profileId?.trim();
    if (profileId) {
      bumpRow(
        byProfileMap,
        profileId,
        profileId,
        run.attributedCostUsd,
        run.estimated,
        runDurationMs(run),
        run.toolId ?? undefined,
      );
    }

    if (run.toolId) {
      const toolRow = byToolMap.get(run.toolId);
      if (toolRow) {
        toolRow.runCount += 1;
        toolRow.durationMs += runDurationMs(run);
      }
    }
  }

  const byFlow = finalizeRows(byFlowMap);
  const hottest = byFlow[0];
  return {
    byTool: finalizeRows(byToolMap),
    byProfile: finalizeRows(byProfileMap),
    byFlow,
    hottestFlow: hottest
      ? {
          flowId: hottest.id,
          label: hottest.label,
          costUsd: hottest.costUsd,
          runCount: hottest.runCount,
          estimated: hottest.estimated,
        }
      : null,
  };
}

export function evaluateBudgetAlert(
  weekSpendUsd: number,
  prefs: UsageBudgetPrefs,
  providerQuotas: Array<{ labelKey: string; label?: string; usedPercent: number; toolId: UsageToolId }>,
): UsageBudgetAlert {
  const budget = prefs.weeklyBudgetUsd;
  const alertAt = prefs.alertAtPercent;
  let level: UsageBudgetAlert["level"] = "ok";
  let usedPercent = 0;
  let messageKey: UsageBudgetAlert["messageKey"] = "usage.budget.ok";

  if (budget != null && budget > 0) {
    usedPercent = (weekSpendUsd / budget) * 100;
    if (weekSpendUsd >= budget) {
      level = "over";
      messageKey = "usage.budget.over";
    } else if (usedPercent >= alertAt) {
      level = "warn";
      messageKey = "usage.budget.warn";
    }
  }

  const quotaAlerts = providerQuotas
    .filter((q) => q.usedPercent >= alertAt)
    .sort((a, b) => b.usedPercent - a.usedPercent)
    .slice(0, 3);

  if (level === "ok" && quotaAlerts.length > 0) {
    level = quotaAlerts[0]!.usedPercent >= 100 ? "over" : "warn";
    messageKey = "usage.budget.quotaWarn";
  }

  return {
    level,
    weekSpendUsd,
    weeklyBudgetUsd: budget,
    alertAtPercent: alertAt,
    usedPercent: budget != null && budget > 0 ? Math.min(999, Math.round(usedPercent)) : 0,
    messageKey,
    quotaAlerts,
  };
}

export function weekWindowMs(now = Date.now()): { startMs: number; endMs: number } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function rangeWindowMs(days: number, now = Date.now()): { startMs: number; endMs: number } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, days) - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function collectProviderQuotaAlerts(
  tools: UsageToolSnapshot[],
): Array<{ labelKey: string; label?: string; usedPercent: number; toolId: UsageToolId }> {
  const out: Array<{ labelKey: string; label?: string; usedPercent: number; toolId: UsageToolId }> = [];
  for (const tool of tools) {
    if (tool.status !== "ok" || !tool.quotas) continue;
    for (const q of tool.quotas) {
      out.push({
        toolId: tool.toolId,
        labelKey: q.labelKey,
        label: q.label,
        usedPercent: q.usedPercent,
      });
    }
  }
  return out;
}

export function sumAttributedCost(
  attributed: Array<{ attributedCostUsd: number }>,
): number {
  return attributed.reduce((sum, r) => sum + r.attributedCostUsd, 0);
}

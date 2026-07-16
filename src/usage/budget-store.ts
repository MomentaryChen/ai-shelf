import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";

const BUDGET_FILE = "usage-budget.json";

export type UsageBudgetPrefs = {
  /** Weekly spend cap in USD; null/undefined means no cap. */
  weeklyBudgetUsd: number | null;
  /** Alert when week spend reaches this percent of the budget (1–100). */
  alertAtPercent: number;
};

export const DEFAULT_USAGE_BUDGET: UsageBudgetPrefs = {
  weeklyBudgetUsd: null,
  alertAtPercent: 80,
};

function budgetPath(): string {
  return join(getAppDataDir(), BUDGET_FILE);
}

function clampAlertPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_USAGE_BUDGET.alertAtPercent;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function normalizeBudgetUsd(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function readUsageBudgetPrefs(): UsageBudgetPrefs {
  try {
    const path = budgetPath();
    if (!existsSync(path)) return { ...DEFAULT_USAGE_BUDGET };
    const data = JSON.parse(readFileSync(path, "utf8")) as Partial<UsageBudgetPrefs>;
    return {
      weeklyBudgetUsd: normalizeBudgetUsd(data.weeklyBudgetUsd),
      alertAtPercent: clampAlertPercent(data.alertAtPercent),
    };
  } catch {
    return { ...DEFAULT_USAGE_BUDGET };
  }
}

export function writeUsageBudgetPrefs(partial: Partial<UsageBudgetPrefs>): UsageBudgetPrefs {
  const current = readUsageBudgetPrefs();
  const next: UsageBudgetPrefs = {
    weeklyBudgetUsd:
      partial.weeklyBudgetUsd !== undefined
        ? normalizeBudgetUsd(partial.weeklyBudgetUsd)
        : current.weeklyBudgetUsd,
    alertAtPercent:
      partial.alertAtPercent !== undefined
        ? clampAlertPercent(partial.alertAtPercent)
        : current.alertAtPercent,
  };
  const dir = getAppDataDir();
  mkdirSync(dir, { recursive: true });
  const path = budgetPath();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, path);
  return next;
}

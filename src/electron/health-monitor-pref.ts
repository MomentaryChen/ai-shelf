import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PREF_FILE = "health-monitor-pref.json";

export type HealthMonitorPrefs = {
  /** Background CLI version + doctor checks (non-intrusive). */
  backgroundChecksEnabled: boolean;
  /** Show a red dot on the tray icon when issues are detected. */
  trayBadgeEnabled: boolean;
  /** Optional weekly desktop notification with doctor summary. */
  weeklyDoctorSummary: boolean;
};

type HealthMonitorStore = HealthMonitorPrefs & {
  lastWeeklySummaryAt?: string | null;
};

export const DEFAULT_HEALTH_MONITOR_PREFS: HealthMonitorPrefs = {
  backgroundChecksEnabled: true,
  trayBadgeEnabled: true,
  weeklyDoctorSummary: false,
};

function prefPath(): string {
  return join(app.getPath("userData"), PREF_FILE);
}

export function readHealthMonitorPrefs(): HealthMonitorPrefs {
  try {
    const path = prefPath();
    if (!existsSync(path)) return { ...DEFAULT_HEALTH_MONITOR_PREFS };
    const data = JSON.parse(readFileSync(path, "utf-8")) as Partial<HealthMonitorPrefs>;
    return {
      backgroundChecksEnabled:
        data.backgroundChecksEnabled !== false,
      trayBadgeEnabled: data.trayBadgeEnabled !== false,
      weeklyDoctorSummary: data.weeklyDoctorSummary === true,
    };
  } catch {
    return { ...DEFAULT_HEALTH_MONITOR_PREFS };
  }
}

export function readLastWeeklySummaryAt(): string | null {
  try {
    const path = prefPath();
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, "utf-8")) as HealthMonitorStore;
    return typeof data.lastWeeklySummaryAt === "string" ? data.lastWeeklySummaryAt : null;
  } catch {
    return null;
  }
}

export function writeLastWeeklySummaryAt(iso: string): void {
  const next = { ...readHealthMonitorPrefs(), lastWeeklySummaryAt: iso } as HealthMonitorStore;
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(prefPath(), JSON.stringify(next, null, 2), "utf-8");
}

export function writeHealthMonitorPrefs(partial: Partial<HealthMonitorPrefs>): HealthMonitorPrefs {
  const existing = JSON.parse(
    existsSync(prefPath()) ? readFileSync(prefPath(), "utf-8") : "{}",
  ) as HealthMonitorStore;
  const next: HealthMonitorStore = { ...DEFAULT_HEALTH_MONITOR_PREFS, ...existing, ...partial };
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(prefPath(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

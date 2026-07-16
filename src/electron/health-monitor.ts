import { app, Notification, type BrowserWindow } from "electron";
import { detectAll } from "../inventory/index.js";
import type { ProviderEntry } from "../inventory/types.js";
import { isVersionOlder } from "../utils/version.js";
import { fetchRemoteLatestVersion } from "../utils/latest-version.js";
import { runChecksForEntry, type DoctorToolResult } from "./doctor-checks.js";
import {
  getDesktopSelfLatestVersion,
  isDesktopAutoUpdateEnabled,
} from "./app-updater.js";
import {
  readHealthMonitorPrefs,
  readLastWeeklySummaryAt,
  writeHealthMonitorPrefs,
  writeLastWeeklySummaryAt,
  type HealthMonitorPrefs,
} from "./health-monitor-pref.js";
import { setTrayHealthAlert } from "./tray.js";

const STARTUP_DELAY_MS = 45_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

export type HealthAlertKind = "update" | "doctor-fail" | "doctor-warn" | "auth";

export type HealthAlert = {
  id: string;
  kind: HealthAlertKind;
  severity: "warn" | "fail";
  tool?: string;
  message: string;
};

export type HealthMonitorState = {
  lastCheckAt: string | null;
  lastWeeklySummaryAt: string | null;
  checking: boolean;
  alerts: HealthAlert[];
  outdatedTools: { tool: string; current: string; latest: string }[];
  doctorSummary: { failCount: number; warnCount: number; tools: string[] };
  prefs: HealthMonitorPrefs;
};

let getMainWindow: (() => BrowserWindow | null) | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let checkInFlight = false;

const state: HealthMonitorState = {
  lastCheckAt: null,
  lastWeeklySummaryAt: readLastWeeklySummaryAt(),
  checking: false,
  alerts: [],
  outdatedTools: [],
  doctorSummary: { failCount: 0, warnCount: 0, tools: [] },
  prefs: readHealthMonitorPrefs(),
};

function sendToRenderer(channel: string, payload: unknown): void {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function broadcastState(): void {
  const snapshot = getHealthMonitorState();
  sendToRenderer("health-monitor-state", snapshot);
  if (state.prefs.trayBadgeEnabled) {
    setTrayHealthAlert(snapshot.alerts.length > 0);
  } else {
    setTrayHealthAlert(false);
  }
}

async function buildUpdateAlerts(entries: ProviderEntry[]): Promise<HealthAlert[]> {
  const alerts: HealthAlert[] = [];
  const outdated: HealthMonitorState["outdatedTools"] = [];

  const installed = entries.filter((e) => e.available);
  await Promise.all(
    installed.map(async (entry) => {
      const latest = await fetchRemoteLatestVersion(entry.tool);
      const current = entry.version ?? null;
      if (latest && current && isVersionOlder(current, latest)) {
        outdated.push({ tool: entry.tool, current, latest });
        alerts.push({
          id: `update:${entry.tool}`,
          kind: "update",
          severity: "warn",
          tool: entry.tool,
          message: `${entry.tool} update available (${current} → ${latest})`,
        });
      }
    }),
  );

  if (app.isPackaged && isDesktopAutoUpdateEnabled()) {
    const selfVersion = app.getVersion();
    const latest = getDesktopSelfLatestVersion();
    if (latest && isVersionOlder(selfVersion, latest)) {
      outdated.push({ tool: "ai-shelf", current: selfVersion, latest });
      alerts.push({
        id: "update:ai-shelf",
        kind: "update",
        severity: "warn",
        tool: "ai-shelf",
        message: `AI Shelf desktop update available (${selfVersion} → ${latest})`,
      });
    }
  }

  state.outdatedTools = outdated;
  return alerts;
}

function buildDoctorAlerts(results: DoctorToolResult[]): {
  alerts: HealthAlert[];
  summary: HealthMonitorState["doctorSummary"];
} {
  const alerts: HealthAlert[] = [];
  let failCount = 0;
  let warnCount = 0;
  const tools: string[] = [];

  for (const result of results) {
    const installed = result.checks.some((c) => c.name === "binary" && c.status === "pass");
    if (!installed) continue;

    const fails = result.checks.filter((c) => c.status === "fail");
    const warns = result.checks.filter((c) => c.status === "warn");
    failCount += fails.length;
    warnCount += warns.length;

    if (fails.length === 0 && warns.length === 0) continue;
    tools.push(result.tool);

    for (const check of fails) {
      const kind: HealthAlertKind = check.name === "auth" ? "auth" : "doctor-fail";
      alerts.push({
        id: `doctor:${result.tool}:${check.name}`,
        kind,
        severity: "fail",
        tool: result.tool,
        message: `${result.tool}: ${check.detail}`,
      });
    }

    for (const check of warns) {
      alerts.push({
        id: `doctor:${result.tool}:${check.name}-warn`,
        kind: check.name === "auth" ? "auth" : "doctor-warn",
        severity: "warn",
        tool: result.tool,
        message: `${result.tool}: ${check.detail}`,
      });
    }
  }

  return {
    alerts,
    summary: { failCount, warnCount, tools },
  };
}

function formatWeeklySummaryBody(): string {
  const parts: string[] = [];
  const { failCount, warnCount, tools } = state.doctorSummary;
  if (failCount > 0) {
    parts.push(`${failCount} check${failCount === 1 ? "" : "s"} failed`);
  }
  if (warnCount > 0) {
    parts.push(`${warnCount} warning${warnCount === 1 ? "" : "s"}`);
  }
  if (state.outdatedTools.length > 0) {
    parts.push(
      `${state.outdatedTools.length} CLI update${state.outdatedTools.length === 1 ? "" : "s"} available`,
    );
  }
  if (tools.length > 0) {
    parts.push(`Affected: ${tools.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "All checks passed";
}

function maybeShowWeeklySummary(): void {
  if (!state.prefs.weeklyDoctorSummary) return;
  if (!Notification.isSupported()) return;

  const now = Date.now();
  const last = state.lastWeeklySummaryAt ? Date.parse(state.lastWeeklySummaryAt) : 0;
  if (last && now - last < WEEKLY_MS) return;

  const hasIssues =
    state.doctorSummary.failCount > 0 ||
    state.doctorSummary.warnCount > 0 ||
    state.outdatedTools.length > 0;
  if (!hasIssues) return;

  state.lastWeeklySummaryAt = new Date().toISOString();
  writeLastWeeklySummaryAt(state.lastWeeklySummaryAt);
  const n = new Notification({
    title: "AI Shelf — weekly health summary",
    body: formatWeeklySummaryBody(),
    silent: true,
  });
  n.show();
}

export async function runHealthCheck(): Promise<HealthMonitorState> {
  if (checkInFlight) return getHealthMonitorState();
  checkInFlight = true;
  state.checking = true;
  broadcastState();

  try {
    state.prefs = readHealthMonitorPrefs();
    if (!state.prefs.backgroundChecksEnabled) {
      state.alerts = [];
      state.outdatedTools = [];
      state.doctorSummary = { failCount: 0, warnCount: 0, tools: [] };
      return getHealthMonitorState();
    }

    const entries = await detectAll({ quick: true });
    const updateAlerts = await buildUpdateAlerts(entries);
    const doctorResults = entries.map(runChecksForEntry);
    const { alerts: doctorAlerts, summary } = buildDoctorAlerts(doctorResults);

    state.alerts = [...updateAlerts, ...doctorAlerts];
    state.doctorSummary = summary;
    state.lastCheckAt = new Date().toISOString();

    maybeShowWeeklySummary();
  } catch (err: unknown) {
    console.error("[health-monitor]", err instanceof Error ? err.message : err);
  } finally {
    state.checking = false;
    checkInFlight = false;
    broadcastState();
  }

  return getHealthMonitorState();
}

export function getHealthMonitorState(): HealthMonitorState {
  return {
    ...state,
    alerts: [...state.alerts],
    outdatedTools: [...state.outdatedTools],
    doctorSummary: { ...state.doctorSummary, tools: [...state.doctorSummary.tools] },
    prefs: { ...state.prefs },
  };
}

export function applyHealthMonitorPrefs(partial: Partial<HealthMonitorPrefs>): HealthMonitorPrefs {
  state.prefs = writeHealthMonitorPrefs(partial);
  broadcastState();
  if (state.prefs.backgroundChecksEnabled) {
    void runHealthCheck();
  }
  return state.prefs;
}

export function initHealthMonitor(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow;
  state.prefs = readHealthMonitorPrefs();

  if (startupTimer) clearTimeout(startupTimer);
  startupTimer = setTimeout(() => {
    startupTimer = null;
    void runHealthCheck();
  }, STARTUP_DELAY_MS);

  if (intervalTimer) clearInterval(intervalTimer);
  intervalTimer = setInterval(() => {
    void runHealthCheck();
  }, CHECK_INTERVAL_MS);
}

export function onAppUpdateStateChanged(): void {
  if (!state.prefs.backgroundChecksEnabled) return;
  void runHealthCheck();
}

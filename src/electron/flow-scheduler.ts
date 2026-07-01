import type { BrowserWindow } from "electron";
import { readFlowSchedulePrefs } from "../shared/flow-schedule-pref.js";
import { runDueFlows } from "../flow/core.js";

const TICK_MS = 60_000;

let getMainWindow: (() => BrowserWindow | null) | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

export function initFlowScheduler(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow;
  if (intervalTimer) return;

  const tick = () => {
    void runSchedulerTick();
  };

  intervalTimer = setInterval(tick, TICK_MS);
  void runSchedulerTick();
}

export function stopFlowScheduler(): void {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}

async function runSchedulerTick(): Promise<void> {
  if (tickInFlight) return;
  const prefs = readFlowSchedulePrefs();
  if (!prefs.schedulerEnabled) return;

  tickInFlight = true;
  try {
    const result = await runDueFlows();
    if (result.started.length > 0) {
      const win = getMainWindow?.();
      if (win && !win.isDestroyed()) {
        win.webContents.send("flow-scheduler-tick", result);
      }
    }
  } finally {
    tickInFlight = false;
  }
}

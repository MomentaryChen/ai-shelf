import type { BrowserWindow } from "electron";
import { readFlowSchedulePrefs } from "../shared/flow-schedule-pref.js";
import { runDueFlows } from "../flow/core.js";

const TICK_MS = 60_000;

let getMainWindow: (() => BrowserWindow | null) | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let alignTimer: ReturnType<typeof setTimeout> | null = null;
let tickInFlight = false;

export function initFlowScheduler(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow;
  if (intervalTimer || alignTimer) return;

  const tick = () => {
    void runSchedulerTick();
  };

  // Run once immediately, then align to clock minutes so we don't drift past a fire time.
  void runSchedulerTick();
  const msToNextMinute = TICK_MS - (Date.now() % TICK_MS);
  alignTimer = setTimeout(() => {
    alignTimer = null;
    void runSchedulerTick();
    intervalTimer = setInterval(tick, TICK_MS);
  }, msToNextMinute);
}

export function stopFlowScheduler(): void {
  if (alignTimer) {
    clearTimeout(alignTimer);
    alignTimer = null;
  }
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
    // wait:false — runs are fire-and-forget so a long flow can't hold this
    // tick open and starve other flows' fire minutes (runsInFlight in core
    // still prevents overlapping runs of the same flow).
    const result = await runDueFlows(new Date(), { wait: false });
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

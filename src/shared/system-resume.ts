/**
 * Windows sleep/resume leaves the compositor and ConPTY asleep: the window
 * ignores input ("not responding") until something resizes it, and a shell
 * write can sit on a stalled console pipe. These helpers decide what to wake
 * and keep the heavy periodic jobs from all running in that same moment.
 */

export const UI_RESUME_SETTLE_MS = 600;
export const POST_RESUME_QUIET_MS = 8_000;

export type SystemRecoveryEvent = "resume" | "unlock-screen" | "unresponsive" | "gpu-reset";

const RECOVERY_EVENTS = new Set<SystemRecoveryEvent>([
  "resume",
  "unlock-screen",
  "unresponsive",
  "gpu-reset",
]);

export function isSystemRecoveryEvent(event: string): event is SystemRecoveryEvent {
  return RECOVERY_EVENTS.has(event as SystemRecoveryEvent);
}

let resumedAt: number | null = null;

export function noteSystemResume(now = Date.now()): void {
  resumedAt = now;
}

export function resetSystemResumeForTests(): void {
  resumedAt = null;
}

/** True while the network stack and GPU are still coming back. */
export function inPostResumeQuiet(now = Date.now()): boolean {
  return resumedAt != null && now - resumedAt < POST_RESUME_QUIET_MS;
}

export type WindowSnap = {
  destroyed: boolean;
  visible: boolean;
  minimized: boolean;
  width: number;
  height: number;
};

/**
 * Visible windows get a 1px resize so DWM presents a new frame.
 * Hidden or minimized windows are left alone so a resume doesn't pop the tray app.
 */
export function planWindowNudge(win: WindowSnap): { width: number; height: number } | null {
  if (win.destroyed || !win.visible || win.minimized) return null;
  if (win.width < 2 || win.height < 2) return null;
  return { width: win.width, height: win.height };
}

/**
 * ConPTY ignores a resize to the current size. Dip one row, then restore,
 * so the console host starts reading and writing again.
 */
export function ptyWakeResizeSteps(
  cols: number,
  rows: number,
): Array<{ cols: number; rows: number }> {
  const c = Number.isFinite(cols) && cols >= 2 ? Math.floor(cols) : 80;
  const r = Number.isFinite(rows) && rows >= 2 ? Math.floor(rows) : 24;
  const dipped = Math.max(2, r - 1);
  if (dipped === r) return [{ cols: c, rows: r }];
  return [
    { cols: c, rows: dipped },
    { cols: c, rows: r },
  ];
}

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * `resume` and `unlock-screen` usually arrive together. The first one arms a
 * single UI refresh; later events in that window are ignored.
 */
export function createRecoveryCoalescer(
  settleMs: number,
  onFire: () => void,
  schedule: (fn: () => void, ms: number) => TimerHandle = (fn, ms) => setTimeout(fn, ms),
  cancelTimer: (handle: TimerHandle) => void = (handle) => {
    clearTimeout(handle);
  },
): { arm: () => void; cancel: () => void } {
  let timer: TimerHandle | null = null;
  return {
    arm() {
      if (timer) return;
      timer = schedule(() => {
        timer = null;
        onFire();
      }, settleMs);
    },
    cancel() {
      if (timer) cancelTimer(timer);
      timer = null;
    },
  };
}

import { app, BrowserWindow, powerMonitor } from "electron";
import {
  UI_RESUME_SETTLE_MS,
  createRecoveryCoalescer,
  noteSystemResume,
  planWindowNudge,
  type SystemRecoveryEvent,
} from "../shared/system-resume.js";

type Hooks = {
  /** Resize live ConPTY sessions so a stalled console host accepts input again. */
  wakePtys: () => void;
};

/**
 * After sleep, Windows can leave this process's windows unresponsive:
 * DWM stops presenting frames, the GPU process drops its context, and ConPTY
 * stops moving bytes. Recover as soon as the OS says we're awake, then nudge
 * visible windows once the display has had a moment to come back.
 */
export function initSystemResume(hooks: Hooks): void {
  const nudgeOnShow = new WeakSet<BrowserWindow>();

  const markForShow = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) nudgeOnShow.add(win);
    }
  };

  const refreshVisibleWindows = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (nudgeWindow(win)) nudgeOnShow.delete(win);
      sendOsResume(win);
    }
  };

  const ui = createRecoveryCoalescer(UI_RESUME_SETTLE_MS, refreshVisibleWindows);
  let lastRecoveryAt = 0;

  const onRecovery = (event: SystemRecoveryEvent) => {
    const now = Date.now();
    // resume and unlock-screen (or a second unresponsive) arrive as a burst.
    if (now - lastRecoveryAt < UI_RESUME_SETTLE_MS) return;
    lastRecoveryAt = now;
    noteSystemResume(now);
    markForShow();
    try {
      hooks.wakePtys();
    } catch (err) {
      console.warn("[system-resume] pty wake failed", err);
    }
    ui.arm();
    console.info(`[system-resume] recovering after ${event}`);
  };

  powerMonitor.on("resume", () => {
    onRecovery("resume");
  });
  powerMonitor.on("unlock-screen", () => {
    onRecovery("unlock-screen");
  });

  const bind = (win: BrowserWindow) => {
    win.on("unresponsive", () => {
      onRecovery("unresponsive");
    });
    const onShown = () => {
      if (!nudgeOnShow.has(win)) return;
      nudgeOnShow.delete(win);
      nudgeWindow(win, true);
      sendOsResume(win);
    };
    win.on("show", onShown);
    win.on("restore", onShown);
  };

  app.on("browser-window-created", (_event, win) => {
    bind(win);
  });
  for (const win of BrowserWindow.getAllWindows()) bind(win);

  app.on("child-process-gone", (_event, details) => {
    if (details.type !== "GPU" || details.reason === "clean-exit") return;
    onRecovery("gpu-reset");
  });
}

function sendOsResume(win: BrowserWindow): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send("os-resume");
}

/**
 * @returns whether the window was asked to repaint.
 * A 1px resize wakes DWM after sleep. Maximized and fullscreen windows only
 * get a repaint — resizing them drops the maximized state.
 */
function nudgeWindow(win: BrowserWindow, force = false): boolean {
  if (win.isDestroyed()) return false;
  const bounds = win.getBounds();
  const maximized = win.isMaximized() || win.isFullScreen();
  if (!force) {
    const plan = planWindowNudge({
      destroyed: false,
      visible: win.isVisible(),
      minimized: win.isMinimized(),
      width: bounds.width,
      height: bounds.height,
    });
    if (!plan) return false;
  } else if (bounds.width < 2 || bounds.height < 2) {
    return false;
  }

  try {
    if (maximized) {
      const opacity = win.getOpacity();
      win.setOpacity(opacity > 0.99 ? 0.99 : opacity);
      win.setOpacity(opacity || 1);
    } else {
      win.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width + 1,
        height: bounds.height,
      });
      win.setBounds(bounds);
    }
  } catch {
    return false;
  }
  try {
    win.webContents.invalidate();
  } catch {
    /* already closing */
  }
  return true;
}

import { app, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import { verifyWindowsUpdateSignature } from "./windows-update-signature.js";

const { autoUpdater } = electronUpdater;

/** Windows NSIS updater only; not declared on base AppUpdater in electron-updater types. */
type WindowsAppUpdater = typeof autoUpdater & {
  verifyUpdateCodeSignature: (
    publisherNames: string[],
    unescapedTempUpdateFile: string,
  ) => Promise<string | null>;
};

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export type AppUpdateState = {
  status: AppUpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  error: string | null;
  downloadPercent: number;
};

const STARTUP_CHECK_DELAY_MS = 4_000;

let getMainWindow: (() => BrowserWindow | null) | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
const settledListeners = new Set<() => void>();

function notifyUpdateCheckSettled(): void {
  for (const fn of settledListeners) {
    try {
      fn();
    } catch {
      /* listener error */
    }
  }
}

/** Fires after a background update check reaches a terminal state. */
export function onAppUpdateCheckSettled(listener: () => void): () => void {
  settledListeners.add(listener);
  return () => settledListeners.delete(listener);
}

const state: AppUpdateState = {
  status: "idle",
  currentVersion: "0.0.0",
  latestVersion: null,
  releaseNotes: null,
  error: null,
  downloadPercent: 0,
};

function refreshCurrentVersion(): void {
  try {
    state.currentVersion = app.getVersion();
  } catch {
    state.currentVersion = "unknown";
  }
}

function sendToRenderer(channel: string, payload: unknown): void {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function formatUpdateErrorMessage(raw: string): string {
  const msg = raw.trim();
  if (!msg) return msg;
  if (
    msg.includes("ERR_UPDATER_INVALID_SIGNATURE") ||
    msg.includes("not signed by the application owner") ||
    msg.includes("publisherNames:")
  ) {
    const short = msg.split("publisherNames:")[0]?.trim() || msg;
    return short.length > 320 ? `${short.slice(0, 320)}…` : short;
  }
  return msg.length > 500 ? `${msg.slice(0, 500)}…` : msg;
}

function formatReleaseNotes(notes: unknown): string | null {
  if (notes == null) return null;
  if (typeof notes === "string") return notes.trim() || null;
  if (Array.isArray(notes)) {
    const text = notes
      .map((n) => (typeof n === "string" ? n : (n as { note?: string }).note ?? ""))
      .filter(Boolean)
      .join("\n\n");
    return text.trim() || null;
  }
  return null;
}

function bindAutoUpdaterEvents(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    state.status = "checking";
    state.error = null;
  });

  autoUpdater.on("update-available", (info) => {
    state.status = "available";
    state.latestVersion = info.version ?? null;
    state.releaseNotes = formatReleaseNotes(info.releaseNotes);
    state.error = null;
    sendToRenderer("app-update-available", {
      version: state.latestVersion,
      releaseNotes: state.releaseNotes,
    });
    notifyUpdateCheckSettled();
  });

  autoUpdater.on("update-not-available", (info) => {
    state.status = "not-available";
    state.latestVersion = info.version ?? state.latestVersion;
    state.error = null;
    sendToRenderer("app-update-not-available", {
      version: state.latestVersion,
    });
    notifyUpdateCheckSettled();
  });

  autoUpdater.on("download-progress", (progress) => {
    state.status = "downloading";
    state.downloadPercent = Math.round(progress.percent ?? 0);
    sendToRenderer("app-update-progress", {
      percent: state.downloadPercent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    state.status = "downloaded";
    state.latestVersion = info.version ?? state.latestVersion;
    state.downloadPercent = 100;
    sendToRenderer("app-update-downloaded", {
      version: state.latestVersion,
    });
  });

  autoUpdater.on("error", (err) => {
    state.status = "error";
    state.error = formatUpdateErrorMessage(err.message);
    console.error("[app-updater]", err.message);
    sendToRenderer("app-update-error", { message: state.error });
    notifyUpdateCheckSettled();
  });
}

/** Re-push current updater state so the renderer modal can open (e.g. from Update tab). */
export function syncAppUpdateUiToRenderer(): void {
  if (!app.isPackaged) return;

  switch (state.status) {
    case "available":
      sendToRenderer("app-update-available", {
        version: state.latestVersion,
        releaseNotes: state.releaseNotes,
      });
      break;
    case "downloading":
      sendToRenderer("app-update-progress", {
        percent: state.downloadPercent,
        transferred: 0,
        total: 0,
      });
      break;
    case "downloaded":
      sendToRenderer("app-update-downloaded", { version: state.latestVersion });
      break;
    case "error":
      if (state.error) {
        sendToRenderer("app-update-error", { message: state.error });
      }
      break;
    default:
      break;
  }
}

export function isDesktopAutoUpdateEnabled(): boolean {
  return app.isPackaged;
}

export function initAppUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  getMainWindow = getWindow;
  refreshCurrentVersion();
  if (process.platform === "win32") {
    (autoUpdater as WindowsAppUpdater).verifyUpdateCodeSignature = verifyWindowsUpdateSignature;
  }
  bindAutoUpdaterEvents();
}

export function scheduleStartupUpdateCheck(): void {
  if (!app.isPackaged) return;
  if (startupTimer) clearTimeout(startupTimer);

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void checkAppUpdate();
  }, STARTUP_CHECK_DELAY_MS);
}

export function getAppUpdateState(): AppUpdateState {
  return { ...state };
}

export async function checkAppUpdate(): Promise<AppUpdateState> {
  if (!app.isPackaged) {
    state.status = "idle";
    return getAppUpdateState();
  }

  refreshCurrentVersion();
  try {
    await autoUpdater.checkForUpdates();
  } catch (err: unknown) {
    state.status = "error";
    state.error = err instanceof Error ? err.message : String(err);
    console.error("[app-updater]", state.error);
    sendToRenderer("app-update-error", { message: state.error });
    notifyUpdateCheckSettled();
  }
  return getAppUpdateState();
}

export function downloadAppUpdate(): void {
  if (!app.isPackaged) return;
  if (state.status === "available") {
    state.error = null;
    state.downloadPercent = 0;
    void autoUpdater.downloadUpdate();
    return;
  }
  // Retry only when a version was already identified (avoid blind download on generic errors).
  if (state.status === "error" && state.latestVersion) {
    state.error = null;
    state.downloadPercent = 0;
    state.status = "available";
    void autoUpdater.downloadUpdate();
  }
}

export function quitAndInstallAppUpdate(): void {
  if (!app.isPackaged) return;
  if (state.status !== "downloaded") return;
  autoUpdater.quitAndInstall(false, true);
}

export function getDesktopSelfLatestVersion(): string | null {
  return state.latestVersion;
}

export function isDesktopUpdateDownloaded(): boolean {
  return state.status === "downloaded";
}

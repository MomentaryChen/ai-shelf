import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { NativeImage } from "electron";
import { getProfileForest, setLastActiveGroup } from "./workspace-host.js";

let tray: Tray | null = null;
let isQuitting = false;
let trayDeps: TrayDeps | null = null;
let minimizeToTrayEnabled = true;
let baseTrayIcon: NativeImage | null = null;
let trayHealthAlert = false;
let trayAttentionCount = 0;

export function isSystemTrayEnabled(): boolean {
  return minimizeToTrayEnabled;
}

export function setMinimizeToTrayEnabled(enabled: boolean): void {
  minimizeToTrayEnabled = enabled;
}

export interface TrayDeps {
  iconPath: string;
  getMainWindow: () => BrowserWindow | null;
  getChatWindow: () => BrowserWindow | null;
  createChatWindow: () => void;
}

export function setAppQuitting(quitting: boolean): void {
  isQuitting = quitting;
}

export function getAppQuitting(): boolean {
  return isQuitting;
}

/** Draw a small red dot on the tray icon when health alerts are present. */
function iconWithHealthBadge(base: NativeImage, alert: boolean): NativeImage {
  if (!alert) return base;
  const size = base.getSize();
  const buf = Buffer.from(base.toBitmap());
  const w = size.width;
  const dot = 4;
  for (let dy = 0; dy < dot; dy++) {
    for (let dx = 0; dx < dot; dx++) {
      const x = w - dot + dx;
      const y = dy;
      const i = (y * w + x) * 4;
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 220;
      buf[i + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(buf, { width: w, height: size.height });
}

function applyTrayPresentation(): void {
  if (!tray || !baseTrayIcon) return;
  tray.setImage(iconWithHealthBadge(baseTrayIcon, trayHealthAlert));

  const count = trayAttentionCount;
  if (process.platform === "darwin") {
    tray.setTitle(count > 0 ? String(count) : "");
  }

  const hints: string[] = [];
  if (trayHealthAlert) hints.push("health attention needed");
  if (count > 0) hints.push(`${count} need attention`);
  const suffix = hints.length > 0 ? ` — ${hints.join(", ")}` : "";
  tray.setToolTip(`AI Shelf${suffix}`);
}

export function setTrayHealthAlert(alert: boolean): void {
  trayHealthAlert = alert;
  applyTrayPresentation();
}

function getTerminalWindow(deps: TrayDeps): BrowserWindow | null {
  const chat = deps.getChatWindow();
  if (chat && !chat.isDestroyed()) return chat;
  const main = deps.getMainWindow();
  if (main && !main.isDestroyed()) return main;
  return null;
}

function showTerminalWindow(deps: TrayDeps): void {
  showTerminalFromNotification(deps);
}

/** Focus terminal when user clicks a pane-agent notification. */
export function showTerminalFromNotification(deps: TrayDeps, paneId?: string): void {
  const chat = deps.getChatWindow();
  if (chat && !chat.isDestroyed()) {
    if (!chat.isVisible()) chat.show();
    chat.focus();
    if (paneId) sendPaneAgentFocus(chat, paneId);
    return;
  }
  const main = deps.getMainWindow();
  if (main && !main.isDestroyed()) {
    if (!main.isVisible()) main.show();
    main.focus();
    if (paneId) sendPaneAgentFocus(main, paneId);
    return;
  }
  deps.createChatWindow();
}

function sendPaneAgentFocus(win: BrowserWindow, paneId: string): void {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send("pane-agent-focus", paneId);
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

function hideTerminalWindows(deps: TrayDeps): void {
  for (const getter of [deps.getChatWindow, deps.getMainWindow]) {
    const win = getter();
    if (win && !win.isDestroyed() && win.isVisible()) win.hide();
  }
}

function sendTrayActivateProfile(win: BrowserWindow, profileId: string): void {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send("tray-activate-profile", profileId);
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

function activateProfileFromTray(workspaceId: string, profileId: string, deps: TrayDeps): void {
  try {
    const forest = getProfileForest();
    const found = forest.groups.some((g) =>
      g.profiles.some((p) => p.id === profileId && g.id === workspaceId),
    );
    if (!found) return;
    setLastActiveGroup(workspaceId, profileId);
    showTerminalWindow(deps);
    const target = getTerminalWindow(deps);
    if (target) sendTrayActivateProfile(target, profileId);
    refreshTrayMenu(deps);
  } catch {
    /* profile forest unavailable */
  }
}

function trayWindowItems(deps: TrayDeps): MenuItemConstructorOptions[] {
  return [
    {
      label: "Show Terminal",
      click: () => showTerminalWindow(deps),
    },
    {
      label: "Show AI Shelf",
      click: () => {
        const main = deps.getMainWindow();
        if (main && !main.isDestroyed()) {
          if (!main.isVisible()) main.show();
          main.focus();
        }
      },
    },
  ];
}

/** Fast path — no SQLite / profile forest. Used so the tray icon exists before first paint. */
function buildMinimalTrayMenu(deps: TrayDeps): Menu {
  return Menu.buildFromTemplate([
    ...trayWindowItems(deps),
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        setAppQuitting(true);
        app.quit();
      },
    },
  ]);
}

function buildTrayMenu(deps: TrayDeps): Menu {
  let forest: ReturnType<typeof getProfileForest>;
  try {
    forest = getProfileForest();
  } catch {
    forest = { groups: [], lastActiveGroupId: null, lastActiveProfileId: null, lastActiveByGroup: {} };
  }

  const switchProfileSubmenu: MenuItemConstructorOptions[] = forest.groups
    .filter((g) => g.profiles.length > 0)
    .map((g) => ({
      label: g.name,
      submenu: g.profiles.map((p) => ({
        label: p.name,
        type: "checkbox" as const,
        checked:
          g.id === forest.lastActiveGroupId && p.id === forest.lastActiveProfileId,
        click: () => activateProfileFromTray(g.id, p.id, deps),
      })),
    }));

  const template: MenuItemConstructorOptions[] = [
    ...trayWindowItems(deps),
    { type: "separator" },
    ...(switchProfileSubmenu.length > 0
      ? [{ label: "Switch Profile", submenu: switchProfileSubmenu }]
      : []),
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        setAppQuitting(true);
        app.quit();
      },
    },
  ];

  return Menu.buildFromTemplate(template);
}

export function refreshTrayMenu(deps?: TrayDeps): void {
  const d = deps ?? trayDeps;
  if (!tray || !d) return;
  tray.setContextMenu(buildTrayMenu(d));
  applyTrayPresentation();
}

export function setTrayAttentionCount(count: number, deps?: TrayDeps): void {
  trayAttentionCount = Math.max(0, Math.round(count));
  if (deps) trayDeps = deps;
  applyTrayPresentation();
}

export function getTrayAttentionCount(): number {
  return trayAttentionCount;
}

export function initTray(deps: TrayDeps, opts?: { skipForestMenu?: boolean }): Tray {
  trayDeps = deps;
  const icon = nativeImage.createFromPath(deps.iconPath);
  baseTrayIcon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(iconWithHealthBadge(baseTrayIcon, trayHealthAlert));
  applyTrayPresentation();
  if (opts?.skipForestMenu) {
    tray.setContextMenu(buildMinimalTrayMenu(deps));
  } else {
    refreshTrayMenu(deps);
  }

  tray.on("click", () => {
    const terminal = getTerminalWindow(deps);
    if (terminal?.isVisible()) hideTerminalWindows(deps);
    else showTerminalWindow(deps);
  });

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
  trayAttentionCount = 0;
  trayHealthAlert = false;
}

function showHiddenAppWindows(deps: TrayDeps): void {
  for (const getter of [deps.getMainWindow, deps.getChatWindow]) {
    const win = getter();
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  }
}

/** Apply tray on/off from settings; keeps renderer localStorage and main-process pref in sync. */
export function applySystemTrayEnabled(
  enabled: boolean,
  deps: TrayDeps,
  opts?: { skipForestMenu?: boolean },
): void {
  setMinimizeToTrayEnabled(enabled);
  trayDeps = deps;

  if (enabled) {
    if (!tray) initTray(deps, opts);
    else if (!opts?.skipForestMenu) refreshTrayMenu(deps);
    return;
  }

  destroyTray();
  showHiddenAppWindows(deps);
}

/** Close hides to tray so PTY sessions keep running (when tray is enabled). */
export function bindMinimizeToTray(win: BrowserWindow): void {
  win.on("close", (e) => {
    if (isQuitting || !minimizeToTrayEnabled) return;
    e.preventDefault();
    win.hide();
  });
}

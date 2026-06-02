import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { getProfileTree, setLastActiveGroup } from "./workspace-host.js";

let tray: Tray | null = null;
let isQuitting = false;
let trayDeps: TrayDeps | null = null;
let minimizeToTrayEnabled = true;

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

function getTerminalWindow(deps: TrayDeps): BrowserWindow | null {
  const chat = deps.getChatWindow();
  if (chat && !chat.isDestroyed()) return chat;
  const main = deps.getMainWindow();
  if (main && !main.isDestroyed()) return main;
  return null;
}

function showTerminalWindow(deps: TrayDeps): void {
  const chat = deps.getChatWindow();
  if (chat && !chat.isDestroyed()) {
    if (!chat.isVisible()) chat.show();
    chat.focus();
    return;
  }
  const main = deps.getMainWindow();
  if (main && !main.isDestroyed()) {
    if (!main.isVisible()) main.show();
    main.focus();
    return;
  }
  deps.createChatWindow();
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

function activateProfileFromTray(profileId: string, deps: TrayDeps): void {
  try {
    const tree = getProfileTree();
    if (!tree.profiles.some((p) => p.id === profileId)) return;
    setLastActiveGroup(tree.workspaceId, profileId);
    showTerminalWindow(deps);
    const target = getTerminalWindow(deps);
    if (target) sendTrayActivateProfile(target, profileId);
    refreshTrayMenu(deps);
  } catch {
    /* profile tree unavailable */
  }
}

function buildTrayMenu(deps: TrayDeps): Menu {
  let tree: ReturnType<typeof getProfileTree>;
  try {
    tree = getProfileTree();
  } catch {
    tree = { workspaceId: "", profiles: [], lastActiveProfileId: null };
  }

  const profileItems: MenuItemConstructorOptions[] = tree.profiles.map((p) => ({
    label: p.name,
    type: "checkbox",
    checked: p.id === tree.lastActiveProfileId,
    click: () => activateProfileFromTray(p.id, deps),
  }));

  const template: MenuItemConstructorOptions[] = [
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
    { type: "separator" },
    ...(profileItems.length > 0
      ? [{ label: "Switch Profile", submenu: profileItems }]
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
}

export function initTray(deps: TrayDeps): Tray {
  trayDeps = deps;
  const icon = nativeImage.createFromPath(deps.iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("AI Shelf");
  refreshTrayMenu(deps);

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
}

function showHiddenAppWindows(deps: TrayDeps): void {
  for (const getter of [deps.getMainWindow, deps.getChatWindow]) {
    const win = getter();
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  }
}

/** Apply tray on/off from settings; keeps renderer localStorage and main-process pref in sync. */
export function applySystemTrayEnabled(enabled: boolean, deps: TrayDeps): void {
  setMinimizeToTrayEnabled(enabled);
  trayDeps = deps;

  if (enabled) {
    if (!tray) initTray(deps);
    else refreshTrayMenu(deps);
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

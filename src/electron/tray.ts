import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { getProfileForest, setLastActiveGroup } from "./workspace-host.js";

let tray: Tray | null = null;
let isQuitting = false;
let trayDeps: TrayDeps | null = null;

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

function buildTrayMenu(deps: TrayDeps): Menu {
  let forest: ReturnType<typeof getProfileForest>;
  try {
    forest = getProfileForest();
  } catch {
    forest = { groups: [], lastActiveGroupId: null, lastActiveProfileId: null };
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
  trayDeps = null;
}

/** Close hides to tray so PTY sessions keep running. */
export function bindMinimizeToTray(win: BrowserWindow): void {
  win.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    win.hide();
  });
}

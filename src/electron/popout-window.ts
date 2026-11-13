import { BrowserWindow, ipcMain, screen, webContents } from "electron";
import type { WebContents, WebPreferences } from "electron";
import { getAppQuitting } from "./tray.js";
import { PtyOwnership } from "./pty-ownership.js";
import { PopoutRegistry, type PopoutEntry, type PopoutPaneInfo } from "./popout-registry.js";
import {
  isPointOutsideWindows,
  normalizePopoutSize,
  POPOUT_MIN_SIZE,
  popoutBoundsAtPoint,
  popoutBoundsNearWindow,
} from "./popout-geometry.js";

/**
 * Terminal pane pop-out windows (multi-monitor use).
 *
 * The PTY never moves: the pop-out attaches to the same session id, and the
 * origin window keeps the pane in its layout tree but hides it. So:
 *  - quit / relaunch restores the pane inside the origin layout,
 *  - dock-back just unhides it in its original slot,
 *  - closing the pop-out (X) closes the pane like the pane's own close button.
 */

export interface PanePopoutDeps {
  webPreferences: WebPreferences;
  icon: string;
  pageUrl: () => string;
  attachWindow: (win: BrowserWindow, titleBase: string) => void;
  /** Kill a PTY session (same as a pane close in the origin window). */
  killPtySession: (sessionId: string) => void;
}

/** Why a pop-out ended — tells the origin window what to do with the hidden pane. */
export type PopoutEndReason = "docked" | "closed" | "gone";

export type PopoutOriginEvent =
  | { type: "ended"; paneId: string; reason: PopoutEndReason }
  | { type: "cwd"; paneId: string; sessionId: string; cwd: string };

export type PopoutOpenResult =
  | { ok: true }
  | { ok: false; reason: "inside-window" | "invalid" | "no-origin" };

interface PopoutOpenRequest {
  pane: PopoutPaneInfo;
  label: string;
  accentColor: string | null;
  width?: number;
  height?: number;
  trigger: "drag" | "menu";
}

const registry = new PopoutRegistry();
const ownership = new PtyOwnership();
const windows = new Map<number, BrowserWindow>();
const hookedOrigins = new Set<number>();
let deps: PanePopoutDeps | null = null;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseOpenRequest(raw: unknown): PopoutOpenRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pane = r.pane as Record<string, unknown> | null | undefined;
  if (!pane || typeof pane !== "object") return null;
  const id = str(pane.id);
  const sessionId = str(pane.sessionId);
  const tool = str(pane.tool);
  if (!id || !sessionId || !tool) return null;
  const title = str(pane.title);
  const agentSessionId = str(pane.agentSessionId);
  return {
    pane: {
      id,
      sessionId,
      tool,
      cwd: typeof pane.cwd === "string" ? pane.cwd : "",
      ...(title ? { title } : {}),
      ...(agentSessionId ? { agentSessionId } : {}),
    },
    label: str(r.label) ?? title ?? tool,
    accentColor: str(r.accentColor),
    width: num(r.width),
    height: num(r.height),
    trigger: r.trigger === "drag" ? "drag" : "menu",
  };
}

function popoutWindow(entry: PopoutEntry): BrowserWindow | null {
  const win = windows.get(entry.popoutId);
  return win && !win.isDestroyed() ? win : null;
}

function originContents(entry: PopoutEntry): WebContents | null {
  const wc = webContents.fromId(entry.originId);
  return wc && !wc.isDestroyed() ? wc : null;
}

function sendToOrigin(entry: PopoutEntry, payload: PopoutOriginEvent): void {
  originContents(entry)?.send("pane-popout-event", payload);
}

function revealWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

/** Tear down the pop-out window and hand the pane back to the origin (PTY untouched). */
function endPopout(
  paneId: string,
  reason: PopoutEndReason,
  notifyOrigin = true,
): PopoutEntry | null {
  const entry = registry.remove(paneId);
  if (!entry) return null;
  ownership.release(entry.pane.sessionId, entry.popoutId);
  const win = popoutWindow(entry);
  windows.delete(entry.popoutId);
  // destroy() skips the "close" event, so no confirm / kill runs here.
  if (win) win.destroy();
  if (notifyOrigin) sendToOrigin(entry, { type: "ended", paneId, reason });
  return entry;
}

/** User closed the pop-out (X or confirmed busy prompt): close the pane and kill its PTY. */
function closeAsUser(paneId: string): void {
  const entry = endPopout(paneId, "closed");
  if (entry) deps?.killPtySession(entry.pane.sessionId);
}

function dock(paneId: string): boolean {
  const entry = endPopout(paneId, "docked");
  if (!entry) return false;
  const origin = originContents(entry);
  const originWin = origin ? BrowserWindow.fromWebContents(origin) : null;
  if (originWin && !originWin.isDestroyed()) revealWindow(originWin);
  return true;
}

/** Origin window closed or reloaded: drop its pop-outs without closing the panes. */
function hookOrigin(origin: WebContents): void {
  if (hookedOrigins.has(origin.id)) return;
  hookedOrigins.add(origin.id);
  const originId = origin.id;
  const drop = () => {
    for (const entry of registry.byOrigin(originId)) endPopout(entry.pane.id, "gone", false);
  };
  origin.once("destroyed", () => {
    hookedOrigins.delete(originId);
    drop();
  });
  origin.on("did-navigate", drop);
}

function visibleWindowBounds(): Electron.Rectangle[] {
  return BrowserWindow.getAllWindows()
    .filter((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized())
    .map((w) => w.getBounds());
}

function openPopout(origin: WebContents, req: PopoutOpenRequest): PopoutOpenResult {
  const d = deps;
  if (!d) return { ok: false, reason: "invalid" };
  const originWin = BrowserWindow.fromWebContents(origin);
  if (!originWin || originWin.isDestroyed()) return { ok: false, reason: "no-origin" };

  const existing = registry.byPane(req.pane.id);
  if (existing) {
    const win = popoutWindow(existing);
    if (win) revealWindow(win);
    return { ok: true };
  }

  const size = normalizePopoutSize({ width: req.width, height: req.height });
  let bounds: Electron.Rectangle;
  if (req.trigger === "drag") {
    // Event screenX/Y is unreliable once the pointer leaves the window on Windows.
    const point = screen.getCursorScreenPoint();
    if (!isPointOutsideWindows(point, visibleWindowBounds())) {
      return { ok: false, reason: "inside-window" };
    }
    bounds = popoutBoundsAtPoint(point, size, screen.getDisplayNearestPoint(point).workArea);
  } else {
    const originBounds = originWin.getBounds();
    bounds = popoutBoundsNearWindow(
      originBounds,
      size,
      screen.getDisplayMatching(originBounds).workArea,
    );
  }

  // No `parent`: child windows hide / minimize with their parent, but a pop-out
  // must stay put when the main window goes to the tray.
  const win = new BrowserWindow({
    ...bounds,
    minWidth: POPOUT_MIN_SIZE.width,
    minHeight: POPOUT_MIN_SIZE.height,
    title: req.label,
    icon: d.icon,
    webPreferences: d.webPreferences,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
  });
  const popoutId = win.webContents.id;
  const entry: PopoutEntry = {
    pane: req.pane,
    label: req.label,
    accentColor: req.accentColor,
    popoutId,
    originId: origin.id,
    busy: false,
  };
  registry.add(entry);
  windows.set(popoutId, win);
  ownership.claim(req.pane.sessionId, popoutId);
  hookOrigin(origin);

  win.on("close", (e) => {
    // App quit is not "close the terminal": let it go; the pane stays in the origin layout.
    if (getAppQuitting()) return;
    const current = registry.byPopout(popoutId);
    if (!current) return;
    e.preventDefault();
    const wc = win.webContents;
    if (current.busy && !wc.isDestroyed() && !wc.isLoading() && !wc.isCrashed()) {
      revealWindow(win);
      wc.send("pane-popout-confirm-close");
      return;
    }
    closeAsUser(current.pane.id);
  });
  win.on("closed", () => {
    windows.delete(popoutId);
    const current = registry.byPopout(popoutId);
    if (current) endPopout(current.pane.id, "gone");
  });
  win.webContents.on("render-process-gone", () => {
    if (!win.isDestroyed()) win.destroy();
  });

  d.attachWindow(win, req.label);
  void win.loadURL(d.pageUrl());
  return { ok: true };
}

/** Only the owning window may resize / write a popped-out session; others are ignored. */
export function canControlPty(sessionId: string, senderId: number): boolean {
  return ownership.canControl(sessionId, senderId);
}

/** A session was killed from the origin (pane closed or restarted): drop its pop-out. */
export function onPtySessionKilled(sessionId: string): void {
  const entry = registry.bySession(sessionId);
  if (entry) endPopout(entry.pane.id, "gone");
}

export function getPopoutWindowForPane(paneId: string): BrowserWindow | null {
  const entry = registry.byPane(paneId);
  return entry ? popoutWindow(entry) : null;
}

export function getPopoutWindows(): BrowserWindow[] {
  return registry.all().flatMap((e) => {
    const win = popoutWindow(e);
    return win ? [win] : [];
  });
}

export function initPanePopouts(d: PanePopoutDeps): void {
  deps = d;

  ipcMain.handle("pane-popout-open", (event, raw: unknown): PopoutOpenResult => {
    const req = parseOpenRequest(raw);
    if (!req) return { ok: false, reason: "invalid" };
    return openPopout(event.sender, req);
  });

  ipcMain.handle("pane-popout-info", (event) => {
    const entry = registry.byPopout(event.sender.id);
    if (!entry) return null;
    return { pane: entry.pane, label: entry.label, accentColor: entry.accentColor };
  });

  // From the pop-out (no id → its own pane) or from the origin (pane id).
  ipcMain.handle("pane-popout-dock", (event, paneId: unknown) => {
    const own = registry.byPopout(event.sender.id);
    if (own) return { ok: dock(own.pane.id) };
    const id = str(paneId);
    const entry = id ? registry.byPane(id) : null;
    if (!entry || entry.originId !== event.sender.id) return { ok: false };
    return { ok: dock(entry.pane.id) };
  });

  ipcMain.handle("pane-popout-focus", (_event, paneId: unknown) => {
    const id = str(paneId);
    const win = id ? getPopoutWindowForPane(id) : null;
    if (!win) return { ok: false };
    revealWindow(win);
    return { ok: true };
  });

  // Pop-out confirmed the busy prompt, or its process exited and a key was pressed.
  ipcMain.handle("pane-popout-close", (event) => {
    const entry = registry.byPopout(event.sender.id);
    if (!entry) return { ok: false };
    closeAsUser(entry.pane.id);
    return { ok: true };
  });

  ipcMain.on("pane-popout-busy", (event, paneId: unknown, busy: unknown) => {
    const id = str(paneId);
    if (id) registry.setBusy(id, busy === true, event.sender.id);
  });

  // OSC 7 cwd from the pop-out terminal — the origin owns the pane's saved cwd.
  ipcMain.on("pane-popout-cwd", (event, cwd: unknown) => {
    const entry = registry.byPopout(event.sender.id);
    const next = str(cwd);
    if (!entry || !next) return;
    registry.updateCwd(entry.pane.id, next);
    sendToOrigin(entry, {
      type: "cwd",
      paneId: entry.pane.id,
      sessionId: entry.pane.sessionId,
      cwd: next,
    });
  });
}

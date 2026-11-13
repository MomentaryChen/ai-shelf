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
 *  - closing the pop-out (X) closes its panes like the pane's own close button.
 *
 * A pop-out window can hold several panes: "new terminal" inside it asks the
 * origin to spawn a pane (the origin owns spawning, the layout tree and its
 * persistence) and the origin attaches the new pane to the same window.
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
  | { type: "cwd"; paneId: string; sessionId: string; cwd: string }
  /** The pop-out asks for a new terminal next to `anchorPaneId`, shown in the same window. */
  | { type: "new-pane"; requestId: string; anchorPaneId: string };

export type PopoutNewPaneResult = { ok: true } | { ok: false; error?: string };

/** What a pop-out window renders: its panes, pushed again whenever they change. */
export interface PopoutWindowState {
  panes: { pane: PopoutPaneInfo; label: string }[];
  accentColor: string | null;
  /** Pane to bring to the front (just created in this window). */
  activePaneId?: string;
}

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
/** "New terminal" requests waiting for the origin window to answer. */
const pendingNewPanes = new Map<
  string,
  { popoutId: number; resolve: (result: PopoutNewPaneResult) => void; timer: NodeJS.Timeout }
>();
const NEW_PANE_TIMEOUT_MS = 60_000;
let newPaneSeq = 0;
let deps: PanePopoutDeps | null = null;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parsePane(raw: unknown): PopoutPaneInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const pane = raw as Record<string, unknown>;
  const id = str(pane.id);
  const sessionId = str(pane.sessionId);
  const tool = str(pane.tool);
  if (!id || !sessionId || !tool) return null;
  const title = str(pane.title);
  const agentSessionId = str(pane.agentSessionId);
  return {
    id,
    sessionId,
    tool,
    cwd: typeof pane.cwd === "string" ? pane.cwd : "",
    ...(title ? { title } : {}),
    ...(agentSessionId ? { agentSessionId } : {}),
  };
}

function parseOpenRequest(raw: unknown): PopoutOpenRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pane = parsePane(r.pane);
  if (!pane) return null;
  return {
    pane,
    label: str(r.label) ?? pane.title ?? pane.tool,
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

function windowState(popoutId: number, activePaneId?: string): PopoutWindowState | null {
  const entries = registry.byPopout(popoutId);
  if (entries.length === 0) return null;
  return {
    panes: entries.map((e) => ({ pane: e.pane, label: e.label })),
    accentColor: entries[0]!.accentColor,
    ...(activePaneId ? { activePaneId } : {}),
  };
}

/** Tell a pop-out window which panes it shows now. */
function pushWindowState(popoutId: number, activePaneId?: string): void {
  const win = windows.get(popoutId);
  const state = windowState(popoutId, activePaneId);
  if (!win || win.isDestroyed() || !state) return;
  const wc = win.webContents;
  if (!wc.isDestroyed()) wc.send("pane-popout-panes", state);
}

function settleNewPane(requestId: string, result: PopoutNewPaneResult): void {
  const pending = pendingNewPanes.get(requestId);
  if (!pending) return;
  pendingNewPanes.delete(requestId);
  clearTimeout(pending.timer);
  pending.resolve(result);
}

/**
 * Take a pane out of its pop-out window and hand it back to the origin (PTY
 * untouched). The window goes away with its last pane.
 */
function endPopout(
  paneId: string,
  reason: PopoutEndReason,
  notifyOrigin = true,
): PopoutEntry | null {
  const entry = registry.remove(paneId);
  if (!entry) return null;
  ownership.release(entry.pane.sessionId, entry.popoutId);
  if (registry.byPopout(entry.popoutId).length === 0) {
    const win = popoutWindow(entry);
    windows.delete(entry.popoutId);
    for (const [requestId, pending] of [...pendingNewPanes]) {
      if (pending.popoutId === entry.popoutId) settleNewPane(requestId, { ok: false });
    }
    // destroy() skips the "close" event, so no confirm / kill runs here.
    if (win) win.destroy();
  } else {
    pushWindowState(entry.popoutId);
  }
  if (notifyOrigin) sendToOrigin(entry, { type: "ended", paneId, reason });
  return entry;
}

/** User closed a pane of the pop-out (its close button, or exited + key press): kill its PTY. */
function closeAsUser(paneId: string): void {
  const entry = endPopout(paneId, "closed");
  if (entry) deps?.killPtySession(entry.pane.sessionId);
}

/** User closed the pop-out window (X or confirmed busy prompt): close every pane in it. */
function closeWindowAsUser(popoutId: number): void {
  for (const entry of registry.byPopout(popoutId)) closeAsUser(entry.pane.id);
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
    // App quit is not "close the terminal": let it go; the panes stay in the origin layout.
    if (getAppQuitting()) return;
    const current = registry.byPopout(popoutId);
    if (current.length === 0) return;
    e.preventDefault();
    const wc = win.webContents;
    const busy = current.some((c) => c.busy);
    if (busy && !wc.isDestroyed() && !wc.isLoading() && !wc.isCrashed()) {
      revealWindow(win);
      wc.send("pane-popout-confirm-close");
      return;
    }
    closeWindowAsUser(popoutId);
  });
  win.on("closed", () => {
    windows.delete(popoutId);
    for (const current of registry.byPopout(popoutId)) endPopout(current.pane.id, "gone");
  });
  win.webContents.on("render-process-gone", () => {
    if (!win.isDestroyed()) win.destroy();
  });

  d.attachWindow(win, req.label);
  void win.loadURL(d.pageUrl());
  return { ok: true };
}

/**
 * Origin spawned a pane for a pop-out's "new terminal": show it in the window
 * that already holds `anchorPaneId`. Only that pane's origin may attach.
 */
function attachPane(origin: WebContents, raw: unknown): { ok: boolean } {
  if (!raw || typeof raw !== "object") return { ok: false };
  const r = raw as Record<string, unknown>;
  const anchorId = str(r.anchorPaneId);
  const pane = parsePane(r.pane);
  const anchor = anchorId ? registry.byPane(anchorId) : null;
  if (!pane || !anchor || anchor.originId !== origin.id) return { ok: false };
  if (registry.byPane(pane.id) || registry.bySession(pane.sessionId)) return { ok: false };
  if (!popoutWindow(anchor)) return { ok: false };
  registry.add({
    pane,
    label: str(r.label) ?? pane.title ?? pane.tool,
    accentColor: anchor.accentColor,
    popoutId: anchor.popoutId,
    originId: anchor.originId,
    busy: false,
  });
  ownership.claim(pane.sessionId, anchor.popoutId);
  pushWindowState(anchor.popoutId, pane.id);
  return { ok: true };
}

/** Pop-out asked for a new terminal: forward to the origin and wait for its answer. */
function requestNewPane(popout: WebContents, anchorPaneId: unknown): Promise<PopoutNewPaneResult> {
  const id = str(anchorPaneId);
  const anchor = id ? registry.inPopout(id, popout.id) : null;
  const origin = anchor ? originContents(anchor) : null;
  if (!anchor || !origin) return Promise.resolve({ ok: false });
  const requestId = `np-${++newPaneSeq}`;
  const popoutId = popout.id;
  return new Promise((resolve) => {
    const timer = setTimeout(() => settleNewPane(requestId, { ok: false }), NEW_PANE_TIMEOUT_MS);
    pendingNewPanes.set(requestId, { popoutId, resolve, timer });
    const event: PopoutOriginEvent = { type: "new-pane", requestId, anchorPaneId: anchor.pane.id };
    origin.send("pane-popout-event", event);
  });
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

/** Bring a pane to the front inside its pop-out window (the window itself is not raised). */
export function selectPopoutPane(paneId: string): void {
  const entry = registry.byPane(paneId);
  if (entry) pushWindowState(entry.popoutId, paneId);
}

export function getPopoutWindows(): BrowserWindow[] {
  return [...windows.values()].filter((win) => !win.isDestroyed());
}

export function initPanePopouts(d: PanePopoutDeps): void {
  deps = d;

  ipcMain.handle("pane-popout-open", (event, raw: unknown): PopoutOpenResult => {
    const req = parseOpenRequest(raw);
    if (!req) return { ok: false, reason: "invalid" };
    return openPopout(event.sender, req);
  });

  ipcMain.handle("pane-popout-info", (event) => windowState(event.sender.id));

  // From the pop-out (one of its panes; no id → all of them) or from the origin (pane id).
  ipcMain.handle("pane-popout-dock", (event, paneId: unknown) => {
    const id = str(paneId);
    const own = registry.byPopout(event.sender.id);
    if (own.length > 0) {
      const targets = id ? own.filter((e) => e.pane.id === id) : own;
      let ok = false;
      for (const entry of targets) ok = dock(entry.pane.id) || ok;
      return { ok };
    }
    const entry = id ? registry.byPane(id) : null;
    if (!entry || entry.originId !== event.sender.id) return { ok: false };
    return { ok: dock(entry.pane.id) };
  });

  // Origin asks to show a pane's pop-out window; the pane comes to the front in it.
  ipcMain.handle("pane-popout-focus", (_event, paneId: unknown) => {
    const id = str(paneId);
    const entry = id ? registry.byPane(id) : null;
    const win = entry ? popoutWindow(entry) : null;
    if (!entry || !win) return { ok: false };
    revealWindow(win);
    selectPopoutPane(entry.pane.id);
    return { ok: true };
  });

  // Pop-out: "new terminal" in this window, next to one of its panes.
  ipcMain.handle("pane-popout-new", (event, anchorPaneId: unknown) =>
    requestNewPane(event.sender, anchorPaneId),
  );

  // Origin: the pane it spawned for a "new terminal" request joins the anchor's window.
  ipcMain.handle("pane-popout-attach", (event, raw: unknown) => attachPane(event.sender, raw));

  // Origin: outcome of a "new terminal" request (error text is already localized).
  ipcMain.on("pane-popout-new-result", (event, requestId: unknown, raw: unknown) => {
    const id = str(requestId);
    const pending = id ? pendingNewPanes.get(id) : null;
    if (!id || !pending) return;
    // Only the origin of that pop-out's panes may answer.
    if (!registry.byPopout(pending.popoutId).some((e) => e.originId === event.sender.id)) return;
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const error = str(r.error);
    settleNewPane(id, r.ok === true ? { ok: true } : { ok: false, ...(error ? { error } : {}) });
  });

  // Pop-out closes one of its panes (close button, or process exited + key press), or,
  // without an id, the whole window after the busy prompt. A busy pane needs `force`.
  ipcMain.handle("pane-popout-close", (event, paneId: unknown, force: unknown) => {
    const id = str(paneId);
    if (!id) {
      if (registry.byPopout(event.sender.id).length === 0) return { ok: false };
      closeWindowAsUser(event.sender.id);
      return { ok: true };
    }
    const entry = registry.inPopout(id, event.sender.id);
    if (!entry) return { ok: false };
    if (entry.busy && force !== true) return { ok: false, busy: true };
    closeAsUser(entry.pane.id);
    return { ok: true };
  });

  ipcMain.on("pane-popout-busy", (event, paneId: unknown, busy: unknown) => {
    const id = str(paneId);
    if (id) registry.setBusy(id, busy === true, event.sender.id);
  });

  // Numbered pane label from the origin (changes as same-tool panes come and go).
  ipcMain.on("pane-popout-label", (event, paneId: unknown, label: unknown) => {
    const id = str(paneId);
    const next = str(label);
    if (!id || !next || !registry.setLabel(id, next, event.sender.id)) return;
    const entry = registry.byPane(id);
    if (entry) pushWindowState(entry.popoutId);
  });

  // OSC 7 cwd from a pop-out terminal — the origin owns the pane's saved cwd.
  ipcMain.on("pane-popout-cwd", (event, paneId: unknown, cwd: unknown) => {
    const id = str(paneId);
    const entry = id ? registry.inPopout(id, event.sender.id) : null;
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

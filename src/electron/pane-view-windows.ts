import { app, BrowserWindow, ipcMain, screen, webContents } from "electron";
import type { WebContents, WebPreferences } from "electron";
import { getAppQuitting } from "./tray.js";
import { PtyOwnership } from "./pty-ownership.js";
import {
  collectDeclPanes,
  PaneViewRegistry,
  type PaneViewDecl,
  type PaneViewEntry,
  type ViewLayoutDecl,
  type ViewPaneDecl,
} from "./pane-view-registry.js";
import { resolvePaneDropTarget, type DropWindow } from "./pane-view-target.js";
import {
  normalizePopoutSize,
  POPOUT_DEFAULT_SIZE,
  POPOUT_MIN_SIZE,
  popoutBoundsAtPoint,
  popoutBoundsNearWindow,
} from "./popout-geometry.js";
import { resolveInitialBounds, type Rect } from "./window-bounds.js";
import { getSavedPaneViews, savePaneViews } from "./pane-view-store.js";

/**
 * Profile "view" windows: extra windows that each show some panes of one
 * profile (multi-monitor use).
 *
 * The origin window (main / chat) stays the authority: its profile layout keeps
 * every pane (hidden while it is in a view), and it declares its views with
 * `pane-view-sync`. Main only reconciles windows to that declaration, routes
 * intents from view windows back to the origin, and decides what a pane drag
 * released somewhere on screen means. PTYs never move; a view window attaches
 * to the same session ids and owns their size / input.
 */

export interface PaneViewDeps {
  webPreferences: WebPreferences;
  icon: string;
  pageUrl: () => string;
  attachWindow: (win: BrowserWindow, titleBase: string) => void;
  /** Main or chat window — the windows that own profile layouts. */
  isOriginWindow: (win: BrowserWindow) => boolean;
  killPtySession: (sessionId: string) => void;
}

/** Sent to the origin window. */
export type PaneViewIntent =
  | {
      type: "move";
      paneId: string;
      /** Profile the pane belongs to (a sidebar drag can be a pane of a non-active profile). */
      profileKey: string;
      /** View the pane came from; null = the origin's own display. */
      fromViewId: string | null;
      target:
        | { kind: "new-view"; bounds: Rect }
        | { kind: "into-view"; viewId: string }
        | { kind: "dock" };
    }
  | { type: "action"; viewId: string; action: Record<string, unknown> & { type: string } };

const registry = new PaneViewRegistry();
const ownership = new PtyOwnership();
const windows = new Map<number, BrowserWindow>();
const hookedOrigins = new Set<number>();
/** webContents ids, most recently focused first (front-to-back for drop targeting). */
let focusOrder: number[] = [];
let deps: PaneViewDeps | null = null;

// ---------------------------------------------------------------------------
// Validation of renderer payloads

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseRect(raw: unknown): Rect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = finite(r.x);
  const y = finite(r.y);
  const width = finite(r.width);
  const height = finite(r.height);
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function parsePane(raw: unknown): ViewPaneDecl | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = str(p.id);
  const tool = str(p.tool);
  const sessionId = str(p.sessionId);
  if (!id || !tool || !sessionId) return null;
  const title = str(p.title);
  const agentSessionId = str(p.agentSessionId);
  return {
    id,
    tool,
    sessionId,
    cwd: typeof p.cwd === "string" ? p.cwd : "",
    ...(title ? { title } : {}),
    ...(agentSessionId ? { agentSessionId } : {}),
  };
}

function parseLayout(raw: unknown, depth = 0): ViewLayoutDecl | null {
  if (!raw || typeof raw !== "object" || depth > 32) return null;
  const n = raw as Record<string, unknown>;
  if (n.kind === "pane") {
    const pane = parsePane(n.pane);
    return pane ? { kind: "pane", pane } : null;
  }
  if (n.kind !== "split") return null;
  const first = parseLayout(n.first, depth + 1);
  const second = parseLayout(n.second, depth + 1);
  const ratio = finite(n.ratio);
  if (!first || !second || ratio === null) return first ?? second;
  return {
    kind: "split",
    id: str(n.id) ?? `split-${String(depth)}`,
    direction: n.direction === "vertical" ? "vertical" : "horizontal",
    ratio,
    first,
    second,
  };
}

function parseRecord<T>(raw: unknown, pick: (v: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const value = pick(v);
    if (value !== null) out[k] = value;
  }
  return out;
}

function parseDecl(raw: unknown): PaneViewDecl | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const viewId = str(d.viewId);
  const profileKey = str(d.profileKey);
  const layout = parseLayout(d.layout);
  if (!viewId || !profileKey || !layout) return null;
  return {
    viewId,
    profileKey,
    profileName: str(d.profileName) ?? "",
    accentColor: str(d.accentColor),
    layout,
    focusedPaneId: str(d.focusedPaneId),
    labels: parseRecord(d.labels, (v) => (typeof v === "string" ? v : null)),
    busy: parseRecord(d.busy, (v) => (typeof v === "boolean" ? v : null)),
    bounds: parseRect(d.bounds),
  };
}

// ---------------------------------------------------------------------------
// Windows

function viewWindow(entry: PaneViewEntry): BrowserWindow | null {
  const win = windows.get(entry.windowId);
  return win && !win.isDestroyed() ? win : null;
}

function originContents(originId: number): WebContents | null {
  const wc = webContents.fromId(originId);
  return wc && !wc.isDestroyed() ? wc : null;
}

function sendIntent(originId: number, intent: PaneViewIntent): boolean {
  const wc = originContents(originId);
  if (!wc) return false;
  wc.send("pane-view-intent", intent);
  return true;
}

function sendToView(entry: PaneViewEntry, channel: string, payload?: unknown): void {
  const win = viewWindow(entry);
  if (win) win.webContents.send(channel, payload);
}

function revealWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function claimSessions(entry: PaneViewEntry): void {
  ownership.releaseAllFor(entry.windowId);
  for (const sessionId of registry.sessionsOf(entry.decl.viewId)) {
    ownership.claim(sessionId, entry.windowId);
  }
}

/** Close a view window without touching its panes (declaration dropped / origin gone). */
function destroyView(viewId: string): void {
  const entry = registry.remove(viewId);
  if (!entry) return;
  ownership.releaseAllFor(entry.windowId);
  const win = viewWindow(entry);
  windows.delete(entry.windowId);
  // destroy() skips the "close" event, so no confirm / kill runs here.
  if (win) win.destroy();
}

function initialBounds(decl: PaneViewDecl, origin: WebContents): Rect {
  const originWin = BrowserWindow.fromWebContents(origin);
  const fallback = originWin
    ? screen.getDisplayMatching(originWin.getBounds()).workArea
    : screen.getPrimaryDisplay().workArea;
  return resolveInitialBounds({
    saved: decl.bounds,
    defaults: POPOUT_DEFAULT_SIZE,
    minSize: POPOUT_MIN_SIZE,
    workAreas: screen.getAllDisplays().map((d) => d.workArea),
    fallbackWorkArea: fallback,
  });
}

function createViewWindow(decl: PaneViewDecl, origin: WebContents): void {
  const d = deps;
  if (!d) return;
  const title = decl.profileName || "AI Terminal";
  // No `parent`: child windows hide / minimize with their parent, but a view
  // must stay put when the main window goes to the tray.
  const win = new BrowserWindow({
    ...initialBounds(decl, origin),
    minWidth: POPOUT_MIN_SIZE.width,
    minHeight: POPOUT_MIN_SIZE.height,
    title,
    icon: d.icon,
    webPreferences: d.webPreferences,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
  });
  const windowId = win.webContents.id;
  const viewId = decl.viewId;
  const originId = origin.id;
  const entry: PaneViewEntry = { decl, originId, windowId };
  registry.set(entry);
  windows.set(windowId, win);
  claimSessions(entry);

  win.on("close", (e) => {
    // App quit is not "close the terminals": the views are saved and reopen on launch.
    if (getAppQuitting()) return;
    const current = registry.byView(viewId);
    if (!current) return;
    e.preventDefault();
    const wc = win.webContents;
    if (registry.anyBusy(viewId) && !wc.isDestroyed() && !wc.isLoading() && !wc.isCrashed()) {
      revealWindow(win);
      wc.send("pane-view-confirm-close");
      return;
    }
    closeViewAsUser(viewId);
  });
  win.on("closed", () => {
    windows.delete(windowId);
    const current = registry.remove(viewId);
    ownership.releaseAllFor(windowId);
    // Unexpected loss (renderer crash): give the panes back to the origin.
    if (current && !getAppQuitting()) {
      sendIntent(originId, { type: "action", viewId, action: { type: "dock-all" } });
    }
  });
  win.webContents.on("render-process-gone", () => {
    if (!win.isDestroyed()) win.destroy();
  });

  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const reportBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      boundsTimer = null;
      if (win.isDestroyed() || !registry.byView(viewId)) return;
      const b = win.getNormalBounds();
      sendIntent(originId, {
        type: "action",
        viewId,
        action: { type: "bounds", bounds: { x: b.x, y: b.y, width: b.width, height: b.height } },
      });
    }, 400);
  };
  // move / resize (debounced) — moved / resized do not fire on Linux.
  win.on("move", reportBounds);
  win.on("resize", reportBounds);

  d.attachWindow(win, title);
  void win.loadURL(d.pageUrl());
}

/** Window X confirmed (or nothing busy): ask the origin to close every pane in the view. */
function closeViewAsUser(viewId: string): void {
  const entry = registry.byView(viewId);
  if (!entry) return;
  if (sendIntent(entry.originId, { type: "action", viewId, action: { type: "close-view" } })) {
    return; // the origin closes the panes and drops the view from its declaration
  }
  // Origin gone: close here.
  const sessions = registry.sessionsOf(viewId);
  destroyView(viewId);
  for (const sessionId of sessions) deps?.killPtySession(sessionId);
}

/** Origin closed or reloaded: drop its views without closing the panes (they stay saved). */
function hookOrigin(origin: WebContents): void {
  if (hookedOrigins.has(origin.id)) return;
  hookedOrigins.add(origin.id);
  const originId = origin.id;
  const drop = () => {
    for (const entry of registry.byOrigin(originId)) destroyView(entry.decl.viewId);
  };
  origin.once("destroyed", () => {
    hookedOrigins.delete(originId);
    drop();
  });
  origin.on("did-navigate", drop);
}

function syncViews(origin: WebContents, raw: unknown): void {
  const decls = (Array.isArray(raw) ? raw : []).map(parseDecl).filter((d) => d !== null);
  hookOrigin(origin);
  const declared = new Set(decls.map((d) => d.viewId));
  for (const entry of registry.byOrigin(origin.id)) {
    if (!declared.has(entry.decl.viewId)) destroyView(entry.decl.viewId);
  }
  for (const decl of decls) {
    const existing = registry.byView(decl.viewId);
    if (existing && existing.originId !== origin.id) continue;
    if (existing) {
      const entry: PaneViewEntry = { ...existing, decl };
      registry.set(entry);
      claimSessions(entry);
      sendToView(entry, "pane-view-state", decl);
    } else {
      createViewWindow(decl, origin);
    }
  }
}

// ---------------------------------------------------------------------------
// Drag / open

interface DragEndRequest {
  paneId: string;
  profileKey: string | null;
  profileName: string;
  trigger: "drag" | "menu";
  width?: number;
  height?: number;
}

function parseDragEnd(raw: unknown): DragEndRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const paneId = str(r.paneId);
  if (!paneId) return null;
  return {
    paneId,
    profileKey: str(r.profileKey),
    profileName: str(r.profileName) ?? "",
    trigger: r.trigger === "drag" ? "drag" : "menu",
    width: finite(r.width) ?? undefined,
    height: finite(r.height) ?? undefined,
  };
}

function dropWindows(): DropWindow[] {
  const rank = (id: number) => {
    const i = focusOrder.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return BrowserWindow.getAllWindows()
    .filter((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized())
    .sort((a, b) => rank(a.webContents.id) - rank(b.webContents.id))
    .map((w): DropWindow => {
      const id = w.webContents.id;
      const bounds = w.getBounds();
      const view = registry.byWindow(id);
      if (view) {
        return {
          kind: "view",
          id,
          bounds,
          viewId: view.decl.viewId,
          originId: view.originId,
          profileKey: view.decl.profileKey,
        };
      }
      return deps?.isOriginWindow(w)
        ? { kind: "origin", id, bounds }
        : { kind: "other", id, bounds };
    });
}

type DragEndResult = { ok: boolean; result: "new-view" | "into-view" | "dock" | "reject" | "none" };

function handleDragEnd(sender: WebContents, req: DragEndRequest): DragEndResult {
  const fromView = registry.byWindow(sender.id);
  const originId = fromView ? fromView.originId : sender.id;
  const profileKey = fromView ? fromView.decl.profileKey : req.profileKey;
  const profileName = fromView ? fromView.decl.profileName : req.profileName;
  if (!profileKey) return { ok: false, result: "none" };
  const fromViewId = fromView ? fromView.decl.viewId : null;
  if (fromView && !collectDeclPanes(fromView.decl.layout).some((p) => p.id === req.paneId)) {
    return { ok: false, result: "none" };
  }
  const size = normalizePopoutSize({ width: req.width, height: req.height });

  if (req.trigger === "menu") {
    const senderWin = BrowserWindow.fromWebContents(sender);
    if (!senderWin) return { ok: false, result: "none" };
    const anchor = senderWin.getBounds();
    const bounds = popoutBoundsNearWindow(anchor, size, screen.getDisplayMatching(anchor).workArea);
    const ok = sendIntent(originId, {
      type: "move",
      paneId: req.paneId,
      profileKey,
      fromViewId,
      target: { kind: "new-view", bounds },
    });
    return { ok, result: "new-view" };
  }

  // Event screenX/Y is unreliable once the pointer leaves the window on Windows.
  const point = screen.getCursorScreenPoint();
  const target = resolvePaneDropTarget(point, dropWindows(), {
    paneId: req.paneId,
    originId,
    profileKey,
    fromViewId,
  });
  switch (target.kind) {
    case "none":
      return { ok: true, result: "none" };
    case "reject": {
      const wc = webContents.fromId(target.windowId);
      if (wc && !wc.isDestroyed())
        wc.send("pane-view-notice", { kind: "other-profile", profileName });
      return { ok: true, result: "reject" };
    }
    case "new-view": {
      const bounds = popoutBoundsAtPoint(
        point,
        size,
        screen.getDisplayNearestPoint(point).workArea,
      );
      const ok = sendIntent(originId, {
        type: "move",
        paneId: req.paneId,
        profileKey,
        fromViewId,
        target: { kind: "new-view", bounds },
      });
      return { ok, result: "new-view" };
    }
    case "into-view": {
      const ok = sendIntent(originId, {
        type: "move",
        paneId: req.paneId,
        profileKey,
        fromViewId,
        target: { kind: "into-view", viewId: target.viewId },
      });
      const entry = registry.byView(target.viewId);
      const win = entry ? viewWindow(entry) : null;
      if (win) revealWindow(win);
      return { ok, result: "into-view" };
    }
    case "dock": {
      const ok = sendIntent(originId, {
        type: "move",
        paneId: req.paneId,
        profileKey,
        fromViewId,
        target: { kind: "dock" },
      });
      const origin = originContents(originId);
      const originWin = origin ? BrowserWindow.fromWebContents(origin) : null;
      if (originWin) revealWindow(originWin);
      return { ok, result: "dock" };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API (main.ts / tray.ts)

/** Only the owning view window may resize / write a session it shows; others are ignored. */
export function canControlPty(sessionId: string, senderId: number): boolean {
  return ownership.canControl(sessionId, senderId);
}

/** Bring up the view window showing this pane and focus the pane in it. */
export function focusPaneInPopout(paneId: string): boolean {
  const entry = registry.byPane(paneId);
  const win = entry ? viewWindow(entry) : null;
  if (!entry || !win) return false;
  revealWindow(win);
  sendToView(entry, "pane-view-focus-pane", paneId);
  return true;
}

export function getPopoutWindows(): BrowserWindow[] {
  return registry.all().flatMap((e) => {
    const win = viewWindow(e);
    return win ? [win] : [];
  });
}

export function initPaneViews(d: PaneViewDeps): void {
  deps = d;

  app.on("browser-window-focus", (_event, win) => {
    const id = win.webContents.id;
    focusOrder = [id, ...focusOrder.filter((x) => x !== id)];
  });
  app.on("browser-window-created", (_event, win) => {
    const id = win.webContents.id;
    win.once("closed", () => {
      focusOrder = focusOrder.filter((x) => x !== id);
    });
  });

  // Origin → main: full list of this window's views.
  ipcMain.on("pane-view-sync", (event, decls: unknown) => {
    syncViews(event.sender, decls);
  });

  // Origin or view → main: a pane drag ended (or "Open in new window").
  ipcMain.handle("pane-view-drag-end", (event, raw: unknown): DragEndResult => {
    const req = parseDragEnd(raw);
    if (!req) return { ok: false, result: "none" };
    return handleDragEnd(event.sender, req);
  });

  ipcMain.handle("pane-view-focus", (_event, paneId: unknown) => {
    const id = str(paneId);
    return { ok: id ? focusPaneInPopout(id) : false };
  });

  // View → main: its current declaration (first paint).
  ipcMain.handle(
    "pane-view-get-state",
    (event) => registry.byWindow(event.sender.id)?.decl ?? null,
  );

  // View → origin: close / dock / move / resize / focus / cwd / close-view.
  ipcMain.on("pane-view-action", (event, raw: unknown) => {
    const entry = registry.byWindow(event.sender.id);
    if (!entry || !raw || typeof raw !== "object") return;
    const action = raw as Record<string, unknown>;
    const type = str(action.type);
    if (!type) return;
    if (type === "close-view") {
      closeViewAsUser(entry.decl.viewId);
      return;
    }
    sendIntent(entry.originId, {
      type: "action",
      viewId: entry.decl.viewId,
      action: { ...action, type },
    });
  });

  // Origin → one of its views: a localized message to show there (e.g. "new terminal" failed).
  ipcMain.on("pane-view-notify", (event, viewId: unknown, text: unknown) => {
    const id = str(viewId);
    const message = str(text);
    const entry = id ? registry.byView(id) : null;
    if (!entry || !message || entry.originId !== event.sender.id) return;
    sendToView(entry, "pane-view-notice", { kind: "message", text: message.slice(0, 500) });
  });

  ipcMain.handle("pane-view-store-get", (_event, key: unknown) => {
    const k = str(key);
    return k ? getSavedPaneViews(k) : [];
  });
  ipcMain.handle("pane-view-store-save", (_event, key: unknown, views: unknown) => {
    const k = str(key);
    if (!k) return { ok: false };
    savePaneViews(k, Array.isArray(views) ? views : []);
    return { ok: true };
  });
}

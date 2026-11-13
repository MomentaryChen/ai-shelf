import { app, BrowserWindow, screen } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  centerIn,
  isTitleBarVisible,
  pickWorkArea,
  resolveInitialBounds,
  type Rect,
  type SavedWindowState,
} from "./window-bounds.js";

/**
 * Remembers where each top-level window was (per machine, in Electron userData — not
 * synced) and keeps windows reachable when monitors are unplugged or rearranged.
 */

export type TrackedWindowKey = "main" | "chat";

const STATE_FILE = "window-state.json";
const SAVE_DEBOUNCE_MS = 500;

type StateFile = Partial<Record<TrackedWindowKey, SavedWindowState>>;

function statePath(): string {
  return join(app.getPath("userData"), STATE_FILE);
}

let cache: StateFile | null = null;

function readState(): StateFile {
  if (cache) return cache;
  try {
    const path = statePath();
    cache = existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as StateFile) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function writeState(key: TrackedWindowKey, value: SavedWindowState): void {
  const next = { ...readState(), [key]: value };
  cache = next;
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(statePath(), JSON.stringify(next, null, 2), "utf-8");
  } catch {
    /* best effort — window placement is not worth crashing over */
  }
}

function workAreas(): Rect[] {
  return screen.getAllDisplays().map((d) => d.workArea);
}

/** Work area of the display a window is on, or the one under the mouse cursor. */
function anchorWorkArea(anchor?: BrowserWindow | null): Rect {
  if (anchor && !anchor.isDestroyed()) {
    return screen.getDisplayMatching(anchor.getBounds()).workArea;
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
}

/**
 * Bounds for a tracked window at creation time. Falls back to the display of
 * `anchor` (the window that asked for it) or the cursor's display.
 */
export function getInitialWindowBounds(
  key: TrackedWindowKey,
  defaults: { width: number; height: number },
  minSize: { width: number; height: number },
  anchor?: BrowserWindow | null,
): Rect & { isMaximized: boolean } {
  const saved = readState()[key];
  const bounds = resolveInitialBounds({
    saved,
    defaults,
    minSize,
    workAreas: workAreas(),
    fallbackWorkArea: anchorWorkArea(anchor),
  });
  return { ...bounds, isMaximized: saved?.isMaximized === true };
}

/** Persist a window's normal (un-maximized) bounds while it moves and when it closes. */
export function trackWindowState(win: BrowserWindow, key: TrackedWindowKey): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    writeState(key, { ...win.getNormalBounds(), isMaximized: win.isMaximized() });
  };
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DEBOUNCE_MS);
  };

  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", scheduleSave);
  win.on("unmaximize", scheduleSave);
  win.on("close", save);
}

/** Center a size on the parent window, kept inside the parent's display. */
export function boundsCenteredOnWindow(
  size: { width: number; height: number },
  parent: BrowserWindow | null | undefined,
): Rect | null {
  if (!parent || parent.isDestroyed()) return null;
  const parentBounds = parent.getBounds();
  return centerIn(size, parentBounds, screen.getDisplayMatching(parentBounds).workArea);
}

/** Pull a window back onto a connected display if its title bar is unreachable. */
function ensureOnScreen(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isFullScreen()) return;
  const areas = workAreas();
  if (areas.length === 0) return;
  if (win.isMaximized()) {
    // Windows normally re-maximizes onto a remaining display; if not, restore and re-place.
    if (isTitleBarVisible(win.getBounds(), areas)) return;
    win.unmaximize();
  }
  const bounds = win.getNormalBounds();
  if (isTitleBarVisible(bounds, areas)) return;
  const target = pickWorkArea(bounds, areas);
  if (!target) return;
  const [minWidth, minHeight] = win.getMinimumSize();
  win.setBounds(
    resolveInitialBounds({
      saved: bounds,
      defaults: bounds,
      minSize: { width: minWidth, height: minHeight },
      workAreas: areas,
      fallbackWorkArea: target,
    }),
  );
}

let watching = false;

/** Re-place windows when a monitor is unplugged, added, or its resolution/scale changes. */
export function initDisplayWatcher(): void {
  if (watching) return;
  watching = true;
  const recheck = () => {
    // Let Windows settle its own window moves before checking.
    setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) ensureOnScreen(win);
    }, 300);
  };
  screen.on("display-removed", recheck);
  screen.on("display-added", recheck);
  screen.on("display-metrics-changed", recheck);
}

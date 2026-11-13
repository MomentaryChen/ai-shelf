import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-machine record of each profile's extra view windows (which saved pane
 * slots each view holds + where the window was), so a relaunch reopens them.
 * Kept out of the synced group_layouts table: window placement is per machine.
 *
 * Keyed by `${originKind}|${workspaceId}:${profileId}` — the main and the chat
 * window restore the same profile independently and must not share views.
 * Entries are opaque here; the renderer validates them against the layout.
 */
const STORE_FILE = "pane-views.json";

type StoreFile = Record<string, unknown[]>;

let cache: StoreFile | null = null;

function storePath(): string {
  return join(app.getPath("userData"), STORE_FILE);
}

function readStore(): StoreFile {
  if (cache) return cache;
  try {
    const path = storePath();
    const parsed: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
    cache = parsed && typeof parsed === "object" ? (parsed as StoreFile) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function getSavedPaneViews(key: string): unknown[] {
  const value = readStore()[key];
  return Array.isArray(value) ? value : [];
}

export function savePaneViews(key: string, views: unknown[]): void {
  const next: StoreFile = Object.fromEntries(
    Object.entries(readStore()).filter(([k]) => k !== key),
  );
  if (views.length > 0) next[key] = views;
  cache = next;
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(storePath(), JSON.stringify(next, null, 2), "utf-8");
  } catch {
    /* best effort — losing view placement is not worth crashing over */
  }
}

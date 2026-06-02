import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TRAY_PREF_FILE = "system-tray-pref.json";

export const DEFAULT_SYSTEM_TRAY_ENABLED = true;

function prefPath(): string {
  return join(app.getPath("userData"), TRAY_PREF_FILE);
}

export function readSystemTrayEnabledFromDisk(): boolean {
  try {
    const path = prefPath();
    if (!existsSync(path)) return DEFAULT_SYSTEM_TRAY_ENABLED;
    const data = JSON.parse(readFileSync(path, "utf-8")) as { systemTrayEnabled?: unknown };
    return data.systemTrayEnabled !== false;
  } catch {
    return DEFAULT_SYSTEM_TRAY_ENABLED;
  }
}

export function writeSystemTrayEnabledToDisk(enabled: boolean): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(prefPath(), JSON.stringify({ systemTrayEnabled: enabled }, null, 2), "utf-8");
}

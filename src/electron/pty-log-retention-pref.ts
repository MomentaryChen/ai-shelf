import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PTY_LOG_RETENTION,
  normalizePtyLogRetention,
  type PtyLogRetentionPrefs,
} from "./pty-log-gc.js";

const PREF_FILE = "pty-log-retention-pref.json";

function prefPath(): string {
  return join(app.getPath("userData"), PREF_FILE);
}

export function readPtyLogRetentionPrefs(): PtyLogRetentionPrefs {
  try {
    const path = prefPath();
    if (!existsSync(path)) return { ...DEFAULT_PTY_LOG_RETENTION };
    return normalizePtyLogRetention(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return { ...DEFAULT_PTY_LOG_RETENTION };
  }
}

export function writePtyLogRetentionPrefs(
  partial: Partial<PtyLogRetentionPrefs>,
): PtyLogRetentionPrefs {
  const next = normalizePtyLogRetention({ ...readPtyLogRetentionPrefs(), ...partial });
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(prefPath(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

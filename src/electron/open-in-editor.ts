import { app, ipcMain, shell } from "electron";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { gotoTarget, vscodeFileUrl } from "../shared/path-links.js";

/** Max paths checked per `paths-exist` call (one terminal line's candidates). */
const MAX_EXIST_CHECKS = 32;

function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim();
  if (!p || p.length > 4096 || p.includes("\0")) return null;
  return isAbsolute(p) ? p : null;
}

function cleanPositiveInt(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

async function isFile(p: string): Promise<boolean | null> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return null; // missing
  }
}

let codeCliMissing = false;
let winCodeOnPath: Promise<boolean> | null = null;

/** Characters cmd.exe expands or splits on even inside double quotes. */
const CMD_UNSAFE = /[&^%!()"<>|\r\n]/;

/** Whether `code` (code.cmd) is on PATH — `where` once per app run. */
function windowsCodeOnPath(): Promise<boolean> {
  winCodeOnPath ??= new Promise((resolve) => {
    execFile("where", ["code"], { timeout: 5_000, windowsHide: true }, (err) => resolve(!err));
  });
  return winCodeOnPath;
}

/**
 * `code -g path:line:col`. On Windows `code` is a .cmd wrapper that only runs
 * through cmd.exe, so the target is quoted verbatim and paths with characters
 * cmd would still interpret are refused (the caller then uses vscode://).
 * Elsewhere it runs through execFile with no shell.
 */
async function openWithCodeCli(target: string): Promise<boolean> {
  if (codeCliMissing) return false;
  if (process.platform === "win32") {
    if (CMD_UNSAFE.test(target) || !(await windowsCodeOnPath())) return false;
    return new Promise((resolve) => {
      execFile(
        "cmd.exe",
        ["/d", "/s", "/c", `"code -g "${target}""`],
        { timeout: 10_000, windowsHide: true, windowsVerbatimArguments: true },
        (err) => resolve(!err),
      );
    });
  }
  return new Promise((resolve) => {
    execFile("code", ["-g", target], { timeout: 10_000, windowsHide: true }, (err) => {
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") codeCliMissing = true;
      resolve(!err);
    });
  });
}

/** VS Code registers vscode:// on install; same effect as `code -g`. */
async function openWithVsCodeUrl(path: string, line?: number, col?: number): Promise<boolean> {
  try {
    if (!app.getApplicationNameForProtocol("vscode://")) return false;
    await shell.openExternal(vscodeFileUrl(path, line, col));
    return true;
  } catch {
    return false;
  }
}

/**
 * IPC for terminal path links:
 * - `paths-exist`: which of these absolute paths exist (relative-link filter).
 * - `open-path-at`: open a file at a line in VS Code when available, else the
 *   OS default handler (same as `open-path`).
 */
export function registerOpenInEditorHandlers(): void {
  ipcMain.handle("paths-exist", async (_event, raw: unknown): Promise<boolean[]> => {
    if (!Array.isArray(raw)) return [];
    const list = raw.slice(0, MAX_EXIST_CHECKS);
    return Promise.all(
      list.map(async (item) => {
        const p = cleanPath(item);
        if (!p) return false;
        try {
          await stat(p);
          return true;
        } catch {
          return false;
        }
      }),
    );
  });

  ipcMain.handle("open-path-at", async (_event, req: unknown): Promise<void> => {
    if (!req || typeof req !== "object") return;
    const r = req as { path?: unknown; line?: unknown; col?: unknown };
    const p = cleanPath(r.path);
    if (!p) return;
    const line = cleanPositiveInt(r.line);
    const col = line ? cleanPositiveInt(r.col) : undefined;
    const file = await isFile(p);
    if (file === null) return;
    if (file && line) {
      if (await openWithCodeCli(gotoTarget(p, line, col))) return;
      if (await openWithVsCodeUrl(p, line, col)) return;
    }
    await shell.openPath(p);
  });
}

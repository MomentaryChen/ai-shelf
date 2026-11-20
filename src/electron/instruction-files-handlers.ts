import { ipcMain } from "electron";
import {
  applyInstructionSync,
  checkProjectDir,
  defaultInstructionRoots,
  previewInstructionSync,
  readInstructionFile,
  scanInstructionFiles,
  writeInstructionFile,
} from "./instruction-files-service.js";

/** Roots for a request, or an error when the project folder is unusable. */
function rootsFor(projectDir: unknown) {
  const check = checkProjectDir(projectDir);
  return { roots: defaultInstructionRoots(check.projectDir), error: check.error };
}

/** IPC for Inventory → Instructions. Paths are always resolved from catalogue refs. */
export function registerInstructionFilesHandlers(): void {
  ipcMain.handle("instructions-default-project", () => {
    const check = checkProjectDir(process.cwd());
    return check.projectDir;
  });

  ipcMain.handle("instructions-scan", (_event, projectDir: unknown) => {
    const { roots, error } = rootsFor(projectDir);
    return { ...scanInstructionFiles(roots), projectError: error };
  });

  ipcMain.handle("instructions-read", (_event, projectDir: unknown, ref: unknown) => {
    const { roots, error } = rootsFor(projectDir);
    if (error) return { success: false, content: "", exists: false, error };
    return readInstructionFile(ref, roots);
  });

  ipcMain.handle("instructions-write", (_event, projectDir: unknown, ref: unknown, content: unknown) => {
    const { roots, error } = rootsFor(projectDir);
    if (error) return { success: false, error };
    return writeInstructionFile(ref, content, roots);
  });

  ipcMain.handle("instructions-preview-sync", (_event, projectDir: unknown, opts: unknown) => {
    const { roots, error } = rootsFor(projectDir);
    if (error) return { ok: false, error, items: [] };
    const o = (opts && typeof opts === "object" ? opts : {}) as { source?: unknown; targets?: unknown };
    return previewInstructionSync(o, roots);
  });

  ipcMain.handle("instructions-apply-sync", (_event, projectDir: unknown, opts: unknown) => {
    const { roots, error } = rootsFor(projectDir);
    if (error) return { ok: false, error, results: [] };
    const o = (opts && typeof opts === "object" ? opts : {}) as {
      source?: unknown;
      sourceFingerprint?: unknown;
      targets?: unknown;
    };
    return applyInstructionSync(o, roots);
  });
}

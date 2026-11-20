import { ipcMain } from "electron";
import {
  listClaudeSettingsFiles,
  listKnownClaudeProjects,
  readClaudeSettings,
  writeClaudeSettings,
} from "./claude-settings-files.js";

/** IPC for the Inventory → Config hooks & permissions editor (scope-restricted paths only). */
export function registerClaudeSettingsHandlers(): void {
  ipcMain.handle("claude-settings-list-files", (_event, projectDir?: string) => ({
    files: listClaudeSettingsFiles(projectDir),
    knownProjects: listKnownClaudeProjects(),
  }));

  ipcMain.handle("claude-settings-read", (_event, scope: unknown, projectDir?: unknown) =>
    readClaudeSettings(scope, projectDir),
  );

  ipcMain.handle(
    "claude-settings-write",
    (_event, scope: unknown, projectDir: unknown, expectedContent: unknown, draft: unknown) =>
      writeClaudeSettings(scope, projectDir, expectedContent, draft),
  );
}

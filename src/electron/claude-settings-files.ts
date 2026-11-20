/**
 * File access for the Claude Code hooks & permissions editor (main process only).
 *
 * Paths are never taken from the renderer: they are derived from a scope
 * (user / project / local) plus a project directory, so the IPC surface can only
 * touch `<config>/settings.json`, `<project>/.claude/settings.json` and
 * `<project>/.claude/settings.local.json`. No Electron imports (unit-testable).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  renderClaudeSettingsEdit,
  sanitizeClaudeSettingsDraft,
  type ClaudeSettingsScope,
} from "../shared/claude-settings.js";
import { backupFile, claudeConfigDir, claudeJsonPath, tryReadJson } from "../utils/config.js";

export interface ClaudeSettingsFileInfo {
  scope: ClaudeSettingsScope;
  path: string;
  exists: boolean;
}

export interface ClaudeSettingsReadResult extends ClaudeSettingsFileInfo {
  ok: boolean;
  content: string;
  error?: string;
}

export interface ClaudeSettingsWriteResult {
  ok: boolean;
  path?: string;
  /** Content now on disk (on success). */
  content?: string;
  backupPath?: string | null;
  /** The file changed on disk since it was loaded — reload before saving. */
  conflict?: boolean;
  error?: string;
}

export interface ClaudeSettingsPathOptions {
  /** Defaults to `claudeConfigDir()` (honours `CLAUDE_CONFIG_DIR`). */
  userConfigDir?: string;
}

/** Validated absolute project directory, or null. */
export function normalizeProjectDir(projectDir: unknown): string | null {
  if (typeof projectDir !== "string" || !projectDir.trim()) return null;
  const dir = projectDir.trim();
  if (!isAbsolute(dir)) return null;
  const abs = resolve(dir);
  try {
    return statSync(abs).isDirectory() ? abs : null;
  } catch {
    return null;
  }
}

/** Resolve the settings file for a scope; throws on a bad scope / project dir. */
export function claudeSettingsPath(
  scope: unknown,
  projectDir: unknown,
  opts: ClaudeSettingsPathOptions = {},
): string {
  if (scope === "user") return join(opts.userConfigDir ?? claudeConfigDir(), "settings.json");
  if (scope !== "project" && scope !== "local") throw new Error(`Invalid scope: ${String(scope)}`);
  const dir = normalizeProjectDir(projectDir);
  if (!dir) throw new Error("Project folder is missing or not a directory");
  return join(dir, ".claude", scope === "project" ? "settings.json" : "settings.local.json");
}

/** Which of the three settings files exist for a project (project / local omitted without one). */
export function listClaudeSettingsFiles(
  projectDir: unknown,
  opts: ClaudeSettingsPathOptions = {},
): ClaudeSettingsFileInfo[] {
  const out: ClaudeSettingsFileInfo[] = [];
  const scopes: ClaudeSettingsScope[] = normalizeProjectDir(projectDir)
    ? ["user", "project", "local"]
    : ["user"];
  for (const scope of scopes) {
    const path = claudeSettingsPath(scope, projectDir, opts);
    out.push({ scope, path, exists: existsSync(path) });
  }
  return out;
}

/** Project roots Claude Code knows about (`projects` keys in `~/.claude.json`) that still exist. */
export function listKnownClaudeProjects(jsonPath = claudeJsonPath()): string[] {
  const data = tryReadJson<{ projects?: Record<string, unknown> }>(jsonPath);
  const keys =
    data?.projects && typeof data.projects === "object" ? Object.keys(data.projects) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const dir = normalizeProjectDir(key);
    if (!dir) continue;
    const id = process.platform === "win32" ? dir.toLowerCase() : dir;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(dir);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function readClaudeSettings(
  scope: unknown,
  projectDir: unknown,
  opts: ClaudeSettingsPathOptions = {},
): ClaudeSettingsReadResult {
  let path: string;
  try {
    path = claudeSettingsPath(scope, projectDir, opts);
  } catch (err) {
    return {
      ok: false,
      scope: scope as ClaudeSettingsScope,
      path: "",
      exists: false,
      content: "",
      error: (err as Error).message,
    };
  }
  const base = { scope: scope as ClaudeSettingsScope, path };
  try {
    if (!existsSync(path)) return { ...base, ok: true, exists: false, content: "" };
    return { ...base, ok: true, exists: true, content: readFileSync(path, "utf-8") };
  } catch (err) {
    return { ...base, ok: false, exists: true, content: "", error: (err as Error).message };
  }
}

/**
 * Apply a hooks/permissions draft to the settings file. `expectedContent` is
 * the text the editor loaded (`""` for a missing file); a mismatch means the
 * file changed underneath and nothing is written. Backs up to `.bak` first.
 */
export function writeClaudeSettings(
  scope: unknown,
  projectDir: unknown,
  expectedContent: unknown,
  draftInput: unknown,
  opts: ClaudeSettingsPathOptions = {},
): ClaudeSettingsWriteResult {
  try {
    const path = claudeSettingsPath(scope, projectDir, opts);
    const draft = sanitizeClaudeSettingsDraft(draftInput);
    if (!draft) return { ok: false, error: "Invalid hooks/permissions payload" };
    if (typeof expectedContent !== "string")
      return { ok: false, error: "Invalid expected content" };

    const exists = existsSync(path);
    const current = exists ? readFileSync(path, "utf-8") : "";
    if (current !== expectedContent) {
      return { ok: false, conflict: true, path, error: "File changed on disk since it was loaded" };
    }
    // Throws (→ error result) when the current file is not a JSON object.
    const next = renderClaudeSettingsEdit(current, draft);
    const backupPath = exists ? backupFile(path) : null;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next, "utf-8");
    return { ok: true, path, content: next, backupPath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

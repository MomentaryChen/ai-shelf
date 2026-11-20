/**
 * Main-process file access for the Inventory → Instructions tab.
 *
 * Every entry point takes `InstructionRef`s (catalogue kind + optional Cursor
 * rule path), never raw paths, and resolves them against the roots below — so
 * this is not an arbitrary-file read/write surface. Electron-free for tests.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { backupFile, claudeConfigDir, opencodeConfigDir } from "../utils/config.js";
import { copilotPathCandidates } from "../inventory/copilot.js";
import {
  INSTRUCTION_KINDS,
  contentFingerprint,
  DIRECTORY_KINDS,
  directoryKindDir,
  instructionRefKey,
  instructionRefLabel,
  isDirectoryKind,
  normalizeRulePath,
  planInstructionSync,
  resolveInstructionRef,
  resolveKindPath,
  type InstructionApplyResultItem,
  type InstructionFileInfo,
  type InstructionPreviewResult,
  type InstructionRef,
  type InstructionRoots,
  type InstructionScanResult,
} from "../shared/instruction-files.js";

/** Refuse to load very large files into the editor / diff. */
export const MAX_INSTRUCTION_BYTES = 1024 * 1024;
const MAX_RULE_FILES = 500;

const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";

export interface ProjectDirCheck {
  projectDir: string | null;
  error?: string;
}

/** Accept only an absolute path to an existing directory. */
export function checkProjectDir(projectDir: unknown): ProjectDirCheck {
  if (projectDir == null || projectDir === "") return { projectDir: null };
  if (typeof projectDir !== "string" || !isAbsolute(projectDir)) {
    return { projectDir: null, error: "Project folder must be an absolute path" };
  }
  try {
    if (!statSync(projectDir).isDirectory()) {
      return { projectDir: null, error: "Project folder is not a directory" };
    }
  } catch {
    return { projectDir: null, error: "Project folder does not exist" };
  }
  return { projectDir: resolve(projectDir) };
}

/** Real home-side roots (env overrides honoured, same helpers as inventory). */
export function defaultInstructionRoots(projectDir: string | null): InstructionRoots {
  const copilot = copilotPathCandidates({
    platform: process.platform,
    env: process.env,
    homeDir: homedir(),
    cwd: projectDir ?? homedir(),
  });
  return {
    claudeDir: claudeConfigDir(),
    geminiDir: join(homedir(), ".gemini"),
    copilotDir: dirname(copilot.settings),
    opencodeDir: opencodeConfigDir(),
    projectDir,
    sep,
  };
}

function statInfo(path: string): { exists: boolean; size: number | null; mtimeMs: number | null } {
  try {
    const st = statSync(path);
    if (!st.isFile()) return { exists: false, size: null, mtimeMs: null };
    return { exists: true, size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false, size: null, mtimeMs: null };
  }
}

/**
 * Walk a directory kind's folder for files with an allowed suffix (defaults to
 * Cursor's `.mdc` / `.md`); returns `/`-separated relative paths.
 */
export function listCursorRules(
  dir: string,
  suffixes: readonly string[] = DIRECTORY_KINDS["cursor-rule"].suffixes,
): string[] {
  const out: string[] = [];
  const walk = (abs: string, prefix: string) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_RULE_FILES) return;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(abs, entry.name), rel);
      else if (entry.isFile() && normalizeRulePath(rel, suffixes)) out.push(rel);
    }
  };
  walk(dir, "");
  return out.sort((a, b) => a.localeCompare(b));
}

export function scanInstructionFiles(roots: InstructionRoots): InstructionScanResult {
  const files: InstructionFileInfo[] = [];
  const directoryDirs: InstructionScanResult["directoryDirs"] = {};
  for (const kind of INSTRUCTION_KINDS) {
    if (kind.scope === "project" && !roots.projectDir) continue;
    if (isDirectoryKind(kind.id)) {
      const dir = directoryKindDir(kind.id, roots);
      if (!dir) continue;
      directoryDirs[kind.id] = dir;
      for (const rel of listCursorRules(dir, DIRECTORY_KINDS[kind.id].suffixes)) {
        const ref: InstructionRef = { kindId: kind.id, rulePath: rel };
        const path = resolveInstructionRef(ref, roots);
        if (!path) continue;
        files.push({
          ref,
          kindId: kind.id,
          scope: kind.scope,
          path,
          label: instructionRefLabel(ref),
          readers: kind.readers,
          ...statInfo(path),
        });
      }
      continue;
    }
    const path = resolveKindPath(kind.id, roots);
    if (!path) continue;
    files.push({
      ref: { kindId: kind.id },
      kindId: kind.id,
      scope: kind.scope,
      path,
      label: kind.label,
      readers: kind.readers,
      ...statInfo(path),
    });
  }
  return { projectDir: roots.projectDir, files, directoryDirs };
}

/**
 * Guard against a symlinked `.cursor/rules` / `.github/instructions` (or a
 * subdirectory) that points
 * outside the project: the nearest existing ancestor of `path` must resolve
 * inside the project directory.
 */
function ruleStaysInProject(path: string, roots: InstructionRoots): boolean {
  if (!roots.projectDir) return false;
  let probe = dirname(path);
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) return false;
    probe = parent;
  }
  try {
    const realProject = realpathSync(roots.projectDir);
    const realProbe = realpathSync(probe);
    const rel = relative(realProject, realProbe);
    if (rel.startsWith("..") || isAbsolute(rel)) return false;
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Resolve + validate a ref coming from the renderer. */
export function resolveRefForIo(ref: unknown, roots: InstructionRoots): string | null {
  const path = resolveInstructionRef(ref, roots);
  if (!path) return null;
  if (isDirectoryKind((ref as InstructionRef).kindId) && !ruleStaysInProject(path, roots)) {
    return null;
  }
  return path;
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  const st = statSync(path);
  if (!st.isFile()) throw new Error("Not a regular file");
  if (st.size > MAX_INSTRUCTION_BYTES) throw new Error("File is larger than 1 MB");
  return readFileSync(path, "utf-8");
}

export function readInstructionFile(
  ref: unknown,
  roots: InstructionRoots,
): { success: boolean; content: string; exists: boolean; error?: string } {
  const path = resolveRefForIo(ref, roots);
  if (!path) return { success: false, content: "", exists: false, error: "Path not allowed" };
  try {
    const content = readIfExists(path);
    return { success: true, content: content ?? "", exists: content != null };
  } catch (err) {
    return { success: false, content: "", exists: false, error: (err as Error).message };
  }
}

/** Write (create or overwrite) one catalogued file; existing files get a `.bak`. */
export function writeInstructionFile(
  ref: unknown,
  content: unknown,
  roots: InstructionRoots,
): { success: boolean; error?: string; backupPath?: string | null } {
  if (typeof content !== "string") return { success: false, error: "Invalid content" };
  if (content.length > MAX_INSTRUCTION_BYTES) return { success: false, error: "Content too large" };
  const path = resolveRefForIo(ref, roots);
  if (!path) return { success: false, error: "Path not allowed" };
  try {
    const backupPath = existsSync(path) ? backupFile(path) : null;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
    return { success: true, backupPath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}


function validRefs(list: unknown): InstructionRef[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r): r is InstructionRef =>
      !!r && typeof r === "object" && typeof (r as InstructionRef).kindId === "string",
  );
}

/** Read source + targets and plan the sync. Never writes. */
export function previewInstructionSync(
  opts: { source?: unknown; targets?: unknown },
  roots: InstructionRoots,
): InstructionPreviewResult {
  const source = opts.source as InstructionRef | undefined;
  const sourcePath = resolveRefForIo(source, roots);
  if (!source || !sourcePath) return { ok: false, error: "Source not allowed", items: [] };
  let sourceContent: string | null;
  try {
    sourceContent = readIfExists(sourcePath);
  } catch (err) {
    return { ok: false, error: (err as Error).message, items: [] };
  }
  if (sourceContent == null) return { ok: false, error: "Source file does not exist", items: [] };

  const targets: { ref: InstructionRef; path: string; content: string | null }[] = [];
  for (const ref of validRefs(opts.targets)) {
    const path = resolveRefForIo(ref, roots);
    if (!path) return { ok: false, error: `Target not allowed: ${instructionRefKey(ref)}`, items: [] };
    try {
      targets.push({ ref, path, content: readIfExists(path) });
    } catch (err) {
      return { ok: false, error: `${path}: ${(err as Error).message}`, items: [] };
    }
  }
  if (targets.length === 0) return { ok: false, error: "No targets", items: [] };

  const plan = planInstructionSync({
    source,
    sourcePath,
    sourceContent,
    sourceLabel: instructionRefLabel(source),
    targets,
    caseInsensitive: CASE_INSENSITIVE,
  });
  const byKey = new Map(targets.map((t) => [instructionRefKey(t.ref), t.content]));
  return {
    ok: true,
    sourcePath,
    sourceFingerprint: contentFingerprint(sourceContent),
    items: plan.map((item) => ({
      ...item,
      fingerprint: contentFingerprint(byKey.get(instructionRefKey(item.ref)) ?? null),
    })),
  };
}

/**
 * Apply a previewed sync. Re-reads and re-plans from refs (the renderer never
 * supplies content); a target — or the source — that changed since the
 * preview is reported `stale` and left untouched.
 */
export function applyInstructionSync(
  opts: {
    source?: unknown;
    sourceFingerprint?: unknown;
    targets?: unknown;
  },
  roots: InstructionRoots,
): { ok: boolean; error?: string; results: InstructionApplyResultItem[] } {
  const confirmed = Array.isArray(opts.targets)
    ? (opts.targets as ({ ref?: unknown; fingerprint?: unknown } | null)[])
    : [];
  const refs = validRefs(confirmed.map((c) => c?.ref));
  const preview = previewInstructionSync({ source: opts.source, targets: refs }, roots);
  if (!preview.ok) return { ok: false, error: preview.error, results: [] };
  if (preview.sourceFingerprint !== opts.sourceFingerprint) {
    return { ok: false, error: "Source changed since preview — preview again", results: [] };
  }
  const expected = new Map<string, string>();
  for (const c of confirmed) {
    if (c?.ref && typeof c.ref === "object" && typeof c.fingerprint === "string") {
      expected.set(instructionRefKey(c.ref as InstructionRef), c.fingerprint);
    }
  }

  const results: InstructionApplyResultItem[] = [];
  for (const item of preview.items) {
    const key = instructionRefKey(item.ref);
    if (item.action === "unchanged" || item.action === "blocked") {
      results.push({ ref: item.ref, path: item.path, status: "skipped" });
      continue;
    }
    if (expected.get(key) !== item.fingerprint) {
      results.push({ ref: item.ref, path: item.path, status: "stale" });
      continue;
    }
    const res = writeInstructionFile(item.ref, item.nextContent, roots);
    results.push({
      ref: item.ref,
      path: item.path,
      status: res.success ? "written" : "error",
      backupPath: res.backupPath,
      error: res.error,
    });
  }
  return { ok: true, results };
}

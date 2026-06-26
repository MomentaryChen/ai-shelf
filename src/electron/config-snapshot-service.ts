import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { getAppDataDir } from "ai-shelf";
import type { ProviderEntry } from "../inventory/types.js";
import { CONFIG_SNAPSHOT_FORMAT_VERSION } from "../shared/config-snapshot-keys.js";
import { backupFile } from "../utils/config.js";

export interface ConfigSnapshotEntry {
  kind: "file" | "skill";
  absolutePath: string;
  archiveKey: string;
  skillName?: string;
}

export interface ConfigSnapshotManifest {
  formatVersion: typeof CONFIG_SNAPSHOT_FORMAT_VERSION;
  id: string;
  label: string;
  createdAt: string;
  appVersion: string;
  /** Home directory on the machine that created the snapshot (for cross-host restore). */
  sourceHome?: string;
  fileCount: number;
  skillCount: number;
  entries: ConfigSnapshotEntry[];
}

export interface ConfigSnapshotSummary {
  id: string;
  label: string;
  createdAt: string;
  appVersion: string;
  fileCount: number;
  skillCount: number;
}

export type ConfigSnapshotDiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface ConfigSnapshotDiffItem {
  archiveKey: string;
  kind: "file" | "skill";
  status: ConfigSnapshotDiffStatus;
  absolutePathA?: string;
  absolutePathB?: string;
  skillName?: string;
  /** Present when status is modified and both sides are single files. */
  preview?: string;
}

export interface ConfigSnapshotDiffResult {
  snapshotA: ConfigSnapshotSummary;
  snapshotB: ConfigSnapshotSummary;
  items: ConfigSnapshotDiffItem[];
}

function snapshotsRoot(): string {
  return join(getAppDataDir(), "config-snapshots");
}

function snapshotDir(id: string): string {
  return join(snapshotsRoot(), id);
}

function manifestPath(id: string): string {
  return join(snapshotDir(id), "manifest.json");
}

function bundlePath(id: string): string {
  return join(snapshotDir(id), "bundle.zip");
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Stable zip key for an absolute file path (home → `home/…`). */
export function archiveKeyForFile(absPath: string): string {
  const home = normalizeSlashes(homedir());
  const normalized = normalizeSlashes(absPath);
  if (normalized.toLowerCase().startsWith(home.toLowerCase())) {
    const tail = normalized.slice(home.length).replace(/^\//, "");
    return `files/home/${tail}`;
  }
  return `files/abs/${normalized.replace(/:/g, "_")}`;
}

export function archiveKeyForSkill(skillName: string, relPath: string): string {
  const rel = normalizeSlashes(relPath).replace(/^\.\//, "");
  return `skills/${skillName}/${rel}`;
}

/** Map archive keys to paths on this machine (supports bundles from other hosts). */
export function resolveRestorePath(
  entry: ConfigSnapshotEntry,
  sourceHome?: string,
): string {
  const key = normalizeSlashes(entry.archiveKey);
  if (key.startsWith("files/home/")) {
    const tail = key.slice("files/home/".length);
    return join(homedir(), ...tail.split("/"));
  }
  if (sourceHome && entry.absolutePath) {
    const homeNorm = normalizeSlashes(sourceHome);
    const absNorm = normalizeSlashes(entry.absolutePath);
    if (absNorm.toLowerCase().startsWith(homeNorm.toLowerCase())) {
      const tail = absNorm.slice(homeNorm.length).replace(/^\//, "");
      return join(homedir(), ...tail.split("/"));
    }
  }
  return entry.absolutePath;
}

export function remapManifestPaths(manifest: ConfigSnapshotManifest): ConfigSnapshotManifest {
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({
      ...entry,
      absolutePath: resolveRestorePath(entry, manifest.sourceHome),
    })),
  };
}

function walkFiles(root: string): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = [];
  if (!existsSync(root)) return out;

  const stack: { dir: string; prefix: string }[] = [{ dir: root, prefix: "" }];
  while (stack.length > 0) {
    const { dir, prefix } = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = prefix ? join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        stack.push({ dir: abs, prefix: rel });
      } else if (entry.isFile()) {
        out.push({ rel: normalizeSlashes(rel), abs });
      }
    }
  }
  return out;
}

/** Collect config files and skill directories from inventory scan results. */
export function collectSnapshotTargets(entries: ProviderEntry[]): ConfigSnapshotEntry[] {
  const filePaths = new Set<string>();
  const skillDirs = new Map<string, string>();

  for (const entry of entries) {
    for (const p of [
      ...entry.config.paths,
      ...entry.config.instructionFiles,
      ...entry.mcp.configPaths,
    ]) {
      if (p && existsSync(p) && statSync(p).isFile()) {
        filePaths.add(p);
      }
    }
    for (const skill of entry.skillDetails ?? []) {
      const dir = dirname(skill.path);
      if (existsSync(dir)) skillDirs.set(skill.name, dir);
    }
  }

  const targets: ConfigSnapshotEntry[] = [];
  for (const absolutePath of [...filePaths].sort()) {
    targets.push({
      kind: "file",
      absolutePath,
      archiveKey: archiveKeyForFile(absolutePath),
    });
  }
  for (const [skillName, absolutePath] of [...skillDirs.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    targets.push({
      kind: "skill",
      absolutePath,
      archiveKey: `skills/${skillName}/`,
      skillName,
    });
  }
  return targets;
}

function sha256(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function readBundleEntryMap(data: Buffer): Map<string, Buffer> {
  const unzipped = unzipSync(new Uint8Array(data));
  const map = new Map<string, Buffer>();
  for (const [key, bytes] of Object.entries(unzipped)) {
    map.set(normalizeSlashes(key), Buffer.from(bytes));
  }
  return map;
}

function buildBundleZip(manifest: ConfigSnapshotManifest): Buffer {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
  };

  for (const entry of manifest.entries) {
    if (entry.kind === "file") {
      if (!existsSync(entry.absolutePath)) continue;
      files[entry.archiveKey] = new Uint8Array(readFileSync(entry.absolutePath));
      continue;
    }
    const skillFiles = walkFiles(entry.absolutePath);
    for (const { rel, abs } of skillFiles) {
      const key = archiveKeyForSkill(entry.skillName!, rel);
      files[key] = new Uint8Array(readFileSync(abs));
    }
  }

  return Buffer.from(zipSync(files));
}

function parseManifest(raw: string): ConfigSnapshotManifest {
  const manifest = JSON.parse(raw) as ConfigSnapshotManifest;
  if (manifest.formatVersion !== CONFIG_SNAPSHOT_FORMAT_VERSION) {
    throw new Error(`Unsupported config snapshot format: ${manifest.formatVersion}`);
  }
  if (!manifest.id || !Array.isArray(manifest.entries)) {
    throw new Error("Invalid config snapshot manifest");
  }
  return manifest;
}

function loadManifest(id: string): ConfigSnapshotManifest {
  const path = manifestPath(id);
  if (!existsSync(path)) throw new Error(`Snapshot not found: ${id}`);
  return parseManifest(readFileSync(path, "utf-8"));
}

function loadBundle(id: string): Buffer {
  const path = bundlePath(id);
  if (!existsSync(path)) throw new Error(`Snapshot bundle missing: ${id}`);
  return readFileSync(path);
}

function toSummary(manifest: ConfigSnapshotManifest): ConfigSnapshotSummary {
  return {
    id: manifest.id,
    label: manifest.label,
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    fileCount: manifest.fileCount,
    skillCount: manifest.skillCount,
  };
}

function ensureSnapshotsRoot(): void {
  mkdirSync(snapshotsRoot(), { recursive: true });
}

export function listConfigSnapshots(): ConfigSnapshotSummary[] {
  ensureSnapshotsRoot();
  const summaries: ConfigSnapshotSummary[] = [];
  for (const entry of readdirSync(snapshotsRoot(), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const mPath = join(snapshotsRoot(), entry.name, "manifest.json");
    if (!existsSync(mPath)) continue;
    try {
      summaries.push(toSummary(parseManifest(readFileSync(mPath, "utf-8"))));
    } catch {
      // skip corrupt entries
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createConfigSnapshot(
  entries: ProviderEntry[],
  label: string,
  appVersion: string,
): ConfigSnapshotManifest {
  ensureSnapshotsRoot();
  const targets = collectSnapshotTargets(entries);
  const id = randomUUID();
  const manifest: ConfigSnapshotManifest = {
    formatVersion: CONFIG_SNAPSHOT_FORMAT_VERSION,
    id,
    label: label.trim() || new Date().toLocaleString(),
    createdAt: new Date().toISOString(),
    appVersion,
    sourceHome: homedir(),
    fileCount: targets.filter((t) => t.kind === "file").length,
    skillCount: targets.filter((t) => t.kind === "skill").length,
    entries: targets,
  };

  mkdirSync(snapshotDir(id), { recursive: true });
  writeFileSync(manifestPath(id), JSON.stringify(manifest, null, 2), "utf-8");
  writeFileSync(bundlePath(id), buildBundleZip(manifest));
  return manifest;
}

function restoreFile(absPath: string, content: Buffer): void {
  if (existsSync(absPath)) backupFile(absPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content);
}

function restoreSkillDir(skillDir: string, prefix: string, bundle: Map<string, Buffer>): void {
  const normPrefix = normalizeSlashes(prefix);
  mkdirSync(skillDir, { recursive: true });

  for (const [key, content] of bundle) {
    if (!key.startsWith(normPrefix)) continue;
    const rel = key.slice(normPrefix.length);
    if (!rel || rel.endsWith("/")) continue;
    const dest = join(skillDir, ...rel.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
}

export function restoreConfigSnapshot(id: string): ConfigSnapshotManifest {
  const manifest = remapManifestPaths(loadManifest(id));
  const bundle = readBundleEntryMap(loadBundle(id));

  for (const entry of manifest.entries) {
    const targetPath = resolveRestorePath(entry, manifest.sourceHome);
    if (entry.kind === "file") {
      const content = bundle.get(entry.archiveKey);
      if (!content) continue;
      restoreFile(targetPath, content);
      continue;
    }
    restoreSkillDir(targetPath, entry.archiveKey, bundle);
  }

  return manifest;
}

export function deleteConfigSnapshot(id: string): void {
  const dir = snapshotDir(id);
  if (!existsSync(dir)) throw new Error(`Snapshot not found: ${id}`);
  rmSync(dir, { recursive: true, force: true });
}

function contentHashForEntry(
  entry: ConfigSnapshotEntry,
  bundle: Map<string, Buffer>,
): string {
  if (entry.kind === "file") {
    const content = bundle.get(entry.archiveKey);
    return content ? sha256(content) : "";
  }
  const prefix = normalizeSlashes(entry.archiveKey);
  const parts: string[] = [];
  for (const [key, content] of [...bundle.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (key.startsWith(prefix)) {
      parts.push(`${key}:${sha256(content)}`);
    }
  }
  return sha256(Buffer.from(parts.join("\n"), "utf-8"));
}

function unifiedPreview(a: Buffer, b: Buffer, maxLines = 8): string {
  const linesA = a.toString("utf-8").split(/\r?\n/);
  const linesB = b.toString("utf-8").split(/\r?\n/);
  const out: string[] = [];
  const max = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < max && out.length < maxLines; i++) {
    const la = linesA[i] ?? "";
    const lb = linesB[i] ?? "";
    if (la !== lb) {
      out.push(`- ${la}`);
      out.push(`+ ${lb}`);
    }
  }
  if (out.length === 0) return "(binary or encoding difference)";
  if (max > maxLines) out.push("…");
  return out.join("\n");
}

export function diffConfigSnapshots(idA: string, idB: string): ConfigSnapshotDiffResult {
  const manifestA = loadManifest(idA);
  const manifestB = loadManifest(idB);
  const bundleA = readBundleEntryMap(loadBundle(idA));
  const bundleB = readBundleEntryMap(loadBundle(idB));

  const keysA = new Map(manifestA.entries.map((e) => [e.archiveKey, e]));
  const keysB = new Map(manifestB.entries.map((e) => [e.archiveKey, e]));
  const allKeys = new Set([...keysA.keys(), ...keysB.keys()]);

  const items: ConfigSnapshotDiffItem[] = [];
  for (const archiveKey of [...allKeys].sort()) {
    const entryA = keysA.get(archiveKey);
    const entryB = keysB.get(archiveKey);
    if (entryA && !entryB) {
      items.push({
        archiveKey,
        kind: entryA.kind,
        status: "removed",
        absolutePathA: entryA.absolutePath,
        skillName: entryA.skillName,
      });
      continue;
    }
    if (!entryA && entryB) {
      items.push({
        archiveKey,
        kind: entryB.kind,
        status: "added",
        absolutePathB: entryB.absolutePath,
        skillName: entryB.skillName,
      });
      continue;
    }
    if (!entryA || !entryB) continue;

    const hashA = contentHashForEntry(entryA, bundleA);
    const hashB = contentHashForEntry(entryB, bundleB);
    if (hashA === hashB) {
      items.push({
        archiveKey,
        kind: entryA.kind,
        status: "unchanged",
        absolutePathA: entryA.absolutePath,
        absolutePathB: entryB.absolutePath,
        skillName: entryA.skillName,
      });
    } else {
      let preview: string | undefined;
      if (entryA.kind === "file") {
        const a = bundleA.get(archiveKey);
        const b = bundleB.get(archiveKey);
        if (a && b) preview = unifiedPreview(a, b);
      }
      items.push({
        archiveKey,
        kind: entryA.kind,
        status: "modified",
        absolutePathA: entryA.absolutePath,
        absolutePathB: entryB.absolutePath,
        skillName: entryA.skillName,
        preview,
      });
    }
  }

  return {
    snapshotA: toSummary(manifestA),
    snapshotB: toSummary(manifestB),
    items,
  };
}

export function exportConfigSnapshotBundle(id: string): Buffer {
  const manifest = loadManifest(id);
  return buildBundleZip(manifest);
}

export function importConfigSnapshotBundle(
  data: Buffer,
  label: string,
  appVersion: string,
): ConfigSnapshotManifest {
  ensureSnapshotsRoot();
  const bundle = readBundleEntryMap(data);
  const manifestRaw = bundle.get("manifest.json");
  if (!manifestRaw) throw new Error("Invalid bundle: missing manifest.json");

  const parsed = parseManifest(manifestRaw.toString("utf-8"));
  const id = randomUUID();
  const manifest: ConfigSnapshotManifest = remapManifestPaths({
    ...parsed,
    id,
    label: label.trim() || parsed.label || "Imported snapshot",
    createdAt: new Date().toISOString(),
    appVersion: parsed.appVersion || appVersion,
  });

  mkdirSync(snapshotDir(id), { recursive: true });
  writeFileSync(manifestPath(id), JSON.stringify(manifest, null, 2), "utf-8");
  writeFileSync(bundlePath(id), data);
  return manifest;
}
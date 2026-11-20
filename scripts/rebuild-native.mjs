/**
 * Rebuild native modules for Electron.
 *
 * better-sqlite3: required for workspace DB (rebuilt first).
 * node-pty: required for in-app terminal (optional on failure if Spectre libs missing).
 *
 * Each successful rebuild writes a stamp (node_modules/.cache/ai-shelf-native/<module>.json)
 * recording the Electron version, platform/arch, module path/version and the built .node
 * files' size+mtime. While the stamp still matches, that module's rebuild is skipped, so a
 * plain `pnpm install` no longer recompiles both modules every time. Force a rebuild with
 * `--force`, `--all` (`pnpm rebuild:native:all`) or AISHELF_FORCE_NATIVE_REBUILD=1.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isPostinstall = process.env.npm_lifecycle_event === "postinstall";
const rebuildAll = process.argv.includes("--all");
const forceRebuild =
  rebuildAll ||
  process.argv.includes("--force") ||
  process.env.AISHELF_FORCE_NATIVE_REBUILD === "1";

// CI quality gate (lint / typecheck / unit tests) never loads the native modules
// under Electron, so it skips the slow Electron-ABI rebuild on install.
if (isPostinstall && process.env.AISHELF_SKIP_NATIVE_REBUILD === "1") {
  console.log("AISHELF_SKIP_NATIVE_REBUILD=1 — skipping Electron native module rebuild.");
  process.exit(0);
}

function findNodePtyRoot() {
  const pnpmDir = join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  const entry = readdirSync(pnpmDir)
    .filter((name) => name.startsWith("node-pty@"))
    .sort()
    .at(-1);
  return entry ? join(pnpmDir, entry, "node_modules", "node-pty") : null;
}

function cleanNodePtyBuild() {
  if (process.platform !== "win32") return;
  const ptyRoot = findNodePtyRoot();
  if (!ptyRoot) return;
  const buildDir = join(ptyRoot, "build");
  if (!existsSync(buildDir)) return;
  rmSync(buildDir, { recursive: true, force: true });
  console.log(`Removed stale node-pty build (regenerates without Spectre):\n  ${buildDir}\n`);
}

const BETTER_SQLITE3_ROOT = join(
  root,
  "node_modules",
  ".pnpm",
  "better-sqlite3@12.10.0",
  "node_modules",
  "better-sqlite3",
);

// ── Rebuild stamps ──────────────────────────────────────────────────────────

/** Bump when this script's build steps change in a way that needs fresh binaries. */
const STAMP_SCHEMA = 1;
const STAMP_DIR = join(root, "node_modules", ".cache", "ai-shelf-native");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** size+mtime of every built .node file, or null when there are none. */
function nativeBinaries(moduleRoot) {
  const releaseDir = join(moduleRoot, "build", "Release");
  let names;
  try {
    names = readdirSync(releaseDir)
      .filter((n) => n.endsWith(".node"))
      .sort();
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  return names.map((name) => {
    const st = statSync(join(releaseDir, name));
    return { name, size: st.size, mtimeMs: Math.round(st.mtimeMs) };
  });
}

function stampTarget(moduleRoot) {
  return {
    schema: STAMP_SCHEMA,
    electron: readJson(join(root, "node_modules", "electron", "package.json"))?.version ?? null,
    platform: process.platform,
    arch: process.arch,
    moduleRoot,
    moduleVersion: readJson(join(moduleRoot, "package.json"))?.version ?? null,
  };
}

const stampPath = (name) => join(STAMP_DIR, `${name}.json`);

/** True when the last successful rebuild of `name` still matches the current setup. */
function isUpToDate(name, moduleRoot) {
  if (forceRebuild || !moduleRoot) return false;
  const stamp = readJson(stampPath(name));
  if (!stamp) return false;
  const { binaries, ...target } = stamp;
  const current = nativeBinaries(moduleRoot);
  return (
    current !== null &&
    JSON.stringify(target) === JSON.stringify(stampTarget(moduleRoot)) &&
    JSON.stringify(binaries) === JSON.stringify(current)
  );
}

function clearStamp(name) {
  rmSync(stampPath(name), { force: true });
}

function writeStamp(name, moduleRoot) {
  const binaries = moduleRoot ? nativeBinaries(moduleRoot) : null;
  if (!binaries) return;
  mkdirSync(STAMP_DIR, { recursive: true });
  writeFileSync(
    stampPath(name),
    `${JSON.stringify({ ...stampTarget(moduleRoot), binaries }, null, 2)}\n`,
  );
}

/** Best-effort removal of better-sqlite3 builds moved aside by earlier runs. */
function removeStaleSqliteBuilds() {
  let entries;
  try {
    entries = readdirSync(BETTER_SQLITE3_ROOT).filter((n) => n.startsWith("build.stale."));
  } catch {
    return;
  }
  for (const entry of entries) {
    try {
      rmSync(join(BETTER_SQLITE3_ROOT, entry), { recursive: true, force: true });
    } catch {
      // EBUSY / EPERM: a running Electron still holds the old .node — retry next run.
    }
  }
}

// ── Rebuild ─────────────────────────────────────────────────────────────────

function prepareWindowsSqliteBuild() {
  if (process.platform !== "win32") return;

  const buildDir = join(BETTER_SQLITE3_ROOT, "build");
  if (!existsSync(buildDir)) return;

  const stale = join(BETTER_SQLITE3_ROOT, `build.stale.${Date.now()}`);
  try {
    renameSync(buildDir, stale);
    console.log(`Moved previous better-sqlite3 build aside:\n  ${stale}\n`);
  } catch (err) {
    console.error(`
Could not move ${buildDir}
${err instanceof Error ? err.message : err}

Stop all Electron / "pnpm electron" processes, then run again:
  pnpm run rebuild:native
`);
    if (!isPostinstall) process.exit(1);
  }
}

function runElectronRebuild(modules) {
  const cli = join(root, "node_modules", "@electron", "rebuild", "lib", "cli.js");
  console.log(`\nRebuilding: ${modules.join(", ")}\n`);
  return spawnSync(process.execPath, [cli, "-o", modules.join(",")], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

function failHint(extra = "") {
  return `
electron-rebuild failed.${extra}

Common fixes on Windows:
  1. Quit AI Shelf and stop "pnpm electron" (Ctrl+C)
  2. pnpm install   (uses Electron 41 — required for better-sqlite3)
  3. pnpm run rebuild:native   (pnpm run rebuild:native:all forces every module)

v8::External::Value / SetNativeDataProperty:
  Electron 42 is incompatible with better-sqlite3@12.10.0. This repo pins Electron 41.x.

MSB8040 on node-pty:
  pnpm install applies a patch that disables Spectre (no extra VS components).
  Then: pnpm run rebuild:native:all
  If it persists, delete node_modules/.pnpm/node-pty@*/node_modules/node-pty/build and retry.

Visual Studio: install "Desktop development with C++"
  https://github.com/nodejs/node-gyp#on-windows
`;
}

const ptyRoot = findNodePtyRoot();
const sqliteUpToDate = isUpToDate("better-sqlite3", BETTER_SQLITE3_ROOT);
const ptyUpToDate = isUpToDate("node-pty", ptyRoot);
const skipHint = "Force a rebuild: pnpm rebuild:native:all (or AISHELF_FORCE_NATIVE_REBUILD=1)";

removeStaleSqliteBuilds();

if (sqliteUpToDate && ptyUpToDate) {
  console.log(`Native modules already built for this Electron — skipping rebuild.\n${skipHint}`);
  process.exit(0);
}

if (sqliteUpToDate) {
  console.log("✔ better-sqlite3 already built for this Electron — skipping\n");
} else {
  clearStamp("better-sqlite3");
  prepareWindowsSqliteBuild();

  const sqliteResult = runElectronRebuild(["better-sqlite3"]);
  if (sqliteResult.error) {
    console.error("Failed to run electron-rebuild:", sqliteResult.error.message);
    process.exit(1);
  }

  if (sqliteResult.status !== 0) {
    const hint = failHint("\n\nbetter-sqlite3 rebuild failed (workspace DB will not work).");
    if (isPostinstall) {
      console.warn(`\n⚠️  ${hint}`);
      process.exit(0);
    }
    console.error(hint);
    process.exit(sqliteResult.status ?? 1);
  }

  writeStamp("better-sqlite3", BETTER_SQLITE3_ROOT);
  removeStaleSqliteBuilds();
  console.log("\n✔ better-sqlite3 rebuilt for Electron\n");
}

if (ptyUpToDate) {
  console.log(`✔ node-pty already built for this Electron — skipping\n${skipHint}`);
  process.exit(0);
}

if (!rebuildAll) {
  console.log("Rebuilding node-pty (required for in-app terminal)…\n");
}

clearStamp("node-pty");
cleanNodePtyBuild();
const ptyResult = runElectronRebuild(["node-pty"]);
if (ptyResult.status !== 0) {
  const hint = failHint(
    "\n\nbetter-sqlite3 OK; node-pty failed — in-app terminal may not work until fixed.",
  );
  if (isPostinstall) {
    console.warn(`\n⚠️  ${hint}`);
    process.exit(0);
  }
  console.error(hint);
  process.exit(ptyResult.status ?? 1);
}

writeStamp("node-pty", ptyRoot);
console.log("\n✔ All native modules rebuilt for Electron\n");

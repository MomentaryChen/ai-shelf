/**
 * Rebuild native modules for Electron.
 *
 * better-sqlite3: required for workspace DB (rebuilt first).
 * node-pty: required for in-app terminal (optional on failure if Spectre libs missing).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isPostinstall = process.env.npm_lifecycle_event === "postinstall";
const rebuildAll = process.argv.includes("--all");

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
  1. Quit AI CLI Inventory and stop "pnpm electron" (Ctrl+C)
  2. pnpm install   (uses Electron 41 — required for better-sqlite3)
  3. pnpm run rebuild:native

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

console.log("\n✔ better-sqlite3 rebuilt for Electron\n");

if (!rebuildAll) {
  console.log("Rebuilding node-pty (required for in-app terminal)…\n");
}

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

console.log("\n✔ All native modules rebuilt for Electron\n");

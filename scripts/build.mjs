#!/usr/bin/env node
/**
 * Desktop build after `pnpm build:cli` (root tsc reads packages/cli's .d.ts, and
 * tsup's `clean` wipes them, so the CLI package must finish first).
 *
 * Independent steps then run in parallel:
 *   - tsc (main process + inventory CLI → dist/)
 *   - vite build (renderer → dist/renderer; transpile only)
 *   - write-firebase-config (dist/electron/firebase-config.json, read at runtime)
 * Renderer typechecking lives in `pnpm typecheck` (CI runs it), not here.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveBin, runParallel } from "./run-parallel.mjs";

const ROOT = join(import.meta.dirname, "..");

await runParallel([
  { name: "tsc (main)", script: resolveBin("typescript", "tsc", ROOT), cwd: ROOT },
  {
    name: "vite build (renderer)",
    script: resolveBin("vite", "vite", ROOT),
    args: ["build"],
    cwd: ROOT,
  },
  {
    name: "firebase config",
    script: join(ROOT, "scripts", "write-firebase-config.mjs"),
    cwd: ROOT,
  },
]);

mkdirSync(join(ROOT, "dist", "electron"), { recursive: true });
copyFileSync(join(ROOT, "src/electron/preload.cjs"), join(ROOT, "dist/electron/preload.cjs"));
mkdirSync(join(ROOT, "dist", "assets"), { recursive: true });
copyFileSync(join(ROOT, "src/assets/icon.ico"), join(ROOT, "dist/assets/icon.ico"));
copyFileSync(join(ROOT, "src/assets/icon.png"), join(ROOT, "dist/assets/icon.png"));

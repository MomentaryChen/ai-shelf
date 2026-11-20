#!/usr/bin/env node
/**
 * Run every typecheck pass in parallel, each incremental (`--noEmit --incremental`).
 * Build info lives in node_modules/.cache/tsbuildinfo — kept out of the tsconfigs so
 * the emitting builds (root `tsc`, tsup dts) are unaffected.
 */
import { join } from "node:path";
import { resolveBin, runParallel } from "./run-parallel.mjs";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "packages", "cli");
const CACHE = join(ROOT, "node_modules", ".cache", "tsbuildinfo");

function tscStep(name, cwd, project) {
  return {
    name: `tsc ${name}`,
    script: resolveBin("typescript", "tsc", cwd),
    args: [
      "-p",
      project,
      "--noEmit",
      "--incremental",
      "--tsBuildInfoFile",
      join(CACHE, `${name}.tsbuildinfo`),
    ],
    cwd,
  };
}

await runParallel([
  tscStep("main", ROOT, "tsconfig.json"),
  tscStep("test", ROOT, "tsconfig.test.json"),
  tscStep("renderer", ROOT, "src/renderer/tsconfig.json"),
  tscStep("cli", CLI, "tsconfig.json"),
]);

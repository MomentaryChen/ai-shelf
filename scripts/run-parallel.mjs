/**
 * Tiny parallel step runner for build / typecheck scripts (no extra deps).
 *
 * Each step runs `node <script> ...args` (bins are resolved to their JS entry, so
 * no shell or .cmd shims — works the same on Windows, macOS and Linux). Output is
 * buffered per step and printed when the step finishes, so logs don't interleave.
 * Resolves only when every step succeeded; otherwise exits the process non-zero.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Absolute path of a package's bin script, resolved from `fromDir`. */
export function resolveBin(pkg, binName, fromDir) {
  const require = createRequire(join(fromDir, "package.json"));
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const { bin } = require(pkgJsonPath);
  const rel = typeof bin === "string" ? bin : bin[binName ?? pkg];
  return join(dirname(pkgJsonPath), rel);
}

function runStep({ name, script, args = [], cwd }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      // Children see a pipe; keep colors only when we print to a terminal (CI
      // problem matchers need plain `error TS` lines).
      env:
        process.stdout.isTTY && process.env.FORCE_COLOR === undefined
          ? { ...process.env, FORCE_COLOR: "1" }
          : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => chunks.push(d));
    const finish = (code, error) => {
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const ok = code === 0 && !error;
      const out = Buffer.concat(chunks).toString().trimEnd();
      console.log(`\n${ok ? "✔" : "✖"} ${name} (${secs}s)`);
      if (out) console.log(out);
      if (error) console.error(error.message);
      resolve(ok);
    };
    child.on("error", (err) => finish(1, err));
    child.on("close", (code) => finish(code));
  });
}

export async function runParallel(steps) {
  const results = await Promise.all(steps.map(runStep));
  const failed = steps.filter((_, i) => !results[i]).map((s) => s.name);
  if (failed.length > 0) {
    console.error(`\nFailed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

/**
 * Set root and packages/cli version from the release git tag (vX.Y.Z).
 * Used in CI when GITHUB_REF is refs/tags/v* ; locally: node scripts/sync-version-from-tag.mjs 2.0.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

function resolveVersion() {
  const arg = process.argv[2]?.replace(/^v/, "");
  if (arg && /^\d+\.\d+\.\d+/.test(arg)) return arg.match(/^\d+\.\d+\.\d+/)?.[0] ?? arg;

  const ref = process.env.GITHUB_REF ?? "";
  const m = ref.match(/^refs\/tags\/v(.+)$/);
  if (m) return m[1];

  throw new Error(
    "No version: pass X.Y.Z as argv or set GITHUB_REF=refs/tags/vX.Y.Z",
  );
}

function bumpPackageJson(relPath, version) {
  const path = join(root, relPath);
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  const prev = pkg.version;
  pkg.version = version;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  console.log(`${relPath}: ${prev} → ${version}`);
}

const version = resolveVersion();
bumpPackageJson("package.json", version);
bumpPackageJson("packages/cli/package.json", version);

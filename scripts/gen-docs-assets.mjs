#!/usr/bin/env node
/**
 * Regenerate README / docs visual assets locally before release (single build).
 * - tests/screenshots/{en,zh}/*.png  → README / README.zh-TW, docs/pages.md / pages.zh-TW.md
 * - docs/assets/{en,zh}/terminal-demo.gif → README hero (locale-matched)
 *
 * Requires a Windows desktop + ffmpeg on PATH. Uses an isolated Demo profile group
 * (see tests/e2e/helpers/docs-demo-workspace.ts).
 */
import { spawnSync } from "node:child_process";

const DOCS_LOCALES = ["zh", "en"];

function run(label, command, args, env = {}) {
  console.log(`\n→ ${label}`);
  const result = spawnSync(command, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("build", "pnpm", ["build"]);

for (const locale of DOCS_LOCALES) {
  run(
    `page screenshots (${locale})`,
    "pnpm",
    ["exec", "playwright", "test", "tests/e2e/screenshot.spec.ts"],
    { AISHELF_DOCS_LOCALE: locale },
  );
  run(
    `terminal demo GIF (${locale})`,
    "pnpm",
    ["exec", "playwright", "test", "tests/e2e/terminal-demo-gif.spec.ts"],
    { AISHELF_DOCS_LOCALE: locale, GENERATE_TERMINAL_DEMO_GIF: "1" },
  );
}

console.log("\nDocs assets updated:");
console.log("  tests/screenshots/en/*.png");
console.log("  tests/screenshots/zh/*.png");
console.log("  docs/assets/en/terminal-demo.gif");
console.log("  docs/assets/zh/terminal-demo.gif");
console.log("\nCommit these files with the release.");

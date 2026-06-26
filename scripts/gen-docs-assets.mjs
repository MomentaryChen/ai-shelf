#!/usr/bin/env node
/**
 * Regenerate README / docs visual assets in one pass (single build).
 * - tests/screenshots/*.png  → README, docs/pages.md, docs/pages.zh-TW.md
 * - docs/assets/terminal-demo.gif → README hero
 *
 * Run before release when the desktop UI changed. Requires a display (Windows desktop).
 * CI: GitHub Actions → Docs assets (windows-latest). Locale: AISHELF_DOCS_LOCALE=zh (default).
 */
import { spawnSync } from "node:child_process";

const docsLocale = process.env.AISHELF_DOCS_LOCALE?.trim() || "zh";

function run(label, command, args, env = {}) {
  console.log(`\n→ ${label}`);
  const result = spawnSync(command, args, {
    env: { ...process.env, AISHELF_DOCS_LOCALE: docsLocale, ...env },
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("build", "pnpm", ["build"]);
run(
  "page screenshots",
  "pnpm",
  ["exec", "playwright", "test", "tests/e2e/screenshot.spec.ts"],
);
run(
  "terminal demo GIF",
  "pnpm",
  ["exec", "playwright", "test", "tests/e2e/terminal-demo-gif.spec.ts"],
  { GENERATE_TERMINAL_DEMO_GIF: "1" },
);

console.log("\nDocs assets updated:");
console.log("  tests/screenshots/*.png");
console.log("  docs/assets/terminal-demo.gif");
console.log("\nCommit these files with the release (or a preceding docs commit).");

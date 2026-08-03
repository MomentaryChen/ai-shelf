#!/usr/bin/env node
/**
 * Record terminal demo GIF(s). Default: both locales.
 * Override: AISHELF_DOCS_LOCALE=en|zh for a single locale.
 */
import { spawnSync } from "node:child_process";

const requested = process.env.AISHELF_DOCS_LOCALE?.trim();
const locales =
  requested === "en" || requested === "zh" ? [requested] : ["zh", "en"];

for (const locale of locales) {
  console.log(`\n→ terminal demo GIF (${locale})`);
  const result = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "tests/e2e/terminal-demo-gif.spec.ts"],
    {
      env: {
        ...process.env,
        AISHELF_DOCS_LOCALE: locale,
        GENERATE_TERMINAL_DEMO_GIF: "1",
      },
      stdio: "inherit",
      shell: true,
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.exit(0);

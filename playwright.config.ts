import { defineConfig } from "@playwright/test";

function workerCount(): number {
  const raw = process.env.PW_WORKERS?.trim();
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/artifacts",
  /** Matches long-running Electron screenshots (`tests/e2e/screenshot.spec.ts`). */
  timeout: 420_000,
  /**
   * Default single worker — extra idle workers can extend shutdown after Playwright prints ✓
   * (common with Electron). Override: PW_WORKERS=4 pnpm exec playwright test …
   */
  workers: workerCount(),
  reporter: [["list"]],
});

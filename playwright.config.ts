import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/artifacts",
  timeout: 120_000,
  workers: 7,
});

#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", "tests/e2e/terminal-demo-gif.spec.ts"],
  {
    env: { ...process.env, GENERATE_TERMINAL_DEMO_GIF: "1" },
    stdio: "inherit",
    shell: true,
  },
);

process.exit(result.status ?? 1);

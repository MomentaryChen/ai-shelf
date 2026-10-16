import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runStreaming, type StreamingResult } from "../utils/exec.js";
import { detectAll } from "../inventory/index.js";
import { TOOL_UPDATE } from "../tools.js";

/** Package-manager updates routinely exceed the 10 s default of `run()`. */
export const UPDATE_TIMEOUT_MS = 10 * 60_000;

/** Human-readable reason an update command failed (timeout vs. exit code vs. spawn error). */
export function describeUpdateFailure(
  label: string,
  result: StreamingResult,
  timeoutMs = UPDATE_TIMEOUT_MS,
): string {
  if (result.timedOut) {
    const minutes = Math.round((timeoutMs / 60_000) * 10) / 10;
    return `${label} update timed out after ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (result.error) return `${label} update failed: ${result.error.message}`;
  if (result.code !== null) return `${label} update failed (exit code ${result.code})`;
  if (result.signal) return `${label} update failed (killed by ${result.signal})`;
  return `${label} update failed`;
}

export async function runUpdate(args: string[]) {
  const target = args[0]; // optional: specific tool name

  if (target && target !== "self") {
    await updateTool(target);
    return;
  }

  if (target === "self" || !target) {
    if (!target) {
      // Update all detected tools + self
      const entries = await detectAll();
      for (const entry of entries) {
        if (entry.available && TOOL_UPDATE[entry.tool]) {
          await updateTool(entry.tool);
        }
      }
    }
    await updateSelf();
  }
}

async function updateTool(tool: string) {
  const cfg = TOOL_UPDATE[tool];
  if (!cfg) {
    console.error(`❌ Unknown tool: ${tool}`);
    console.log(`   Available: ${Object.keys(TOOL_UPDATE).join(", ")}, self`);
    return;
  }

  console.log(`\n🔄 Updating ${cfg.label}…`);
  console.log(`   $ ${cfg.cmd} ${cfg.args.join(" ")}\n`);

  const result = await runStreaming(cfg.cmd, cfg.args, { timeoutMs: UPDATE_TIMEOUT_MS });
  if (result.ok) {
    console.log(`✅ ${cfg.label} updated successfully`);
  } else {
    console.error(`❌ ${describeUpdateFailure(cfg.label, result)}`);
  }
}

async function updateSelf() {
  const currentVersion = getCurrentVersion();
  console.log(`\n🔄 Updating ai-shelf (current: ${currentVersion})…`);

  const pm = detectPackageManager();
  const cmd = buildUpdateCommand(pm);
  console.log(`   $ ${cmd}\n`);

  try {
    execSync(cmd, { stdio: "inherit" });
    const newVersion = getInstalledVersion(pm);
    if (newVersion && newVersion !== currentVersion) {
      console.log(`✅ Updated ai-shelf ${currentVersion} → ${newVersion}`);
    } else {
      console.log(`✅ ai-shelf already up to date (${currentVersion})`);
    }
  } catch {
    console.error(`❌ Self-update failed. Try manually:\n   ${cmd}`);
  }
}

function getCurrentVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json");
    return pkg.version as string;
  } catch {
    return "unknown";
  }
}

function detectPackageManager(): "pnpm" | "npm" | "yarn" {
  const execPath = process.env.npm_execpath ?? "";
  if (execPath.includes("pnpm")) return "pnpm";
  if (execPath.includes("yarn")) return "yarn";
  return packageManagerFromInstallPath(fileURLToPath(import.meta.url));
}

/** Infer which package manager installed ai-shelf from where its files live on disk. */
export function packageManagerFromInstallPath(installPath: string): "pnpm" | "npm" | "yarn" {
  const p = installPath.replace(/\\/g, "/").toLowerCase();
  // pnpm global: %LOCALAPPDATA%/pnpm/global, ~/.local/share/pnpm/global, or a .pnpm store dir.
  if (/\/\.?pnpm\//.test(p)) return "pnpm";
  // yarn global: %LOCALAPPDATA%/Yarn/Data/global, ~/.config/yarn/global, ~/.yarn.
  if (/\/\.?yarn\//.test(p)) return "yarn";
  return "npm";
}

function buildUpdateCommand(pm: "pnpm" | "npm" | "yarn"): string {
  switch (pm) {
    case "pnpm":
      return "pnpm update -g ai-shelf";
    case "yarn":
      return "yarn global upgrade ai-shelf";
    case "npm":
      return "npm update -g ai-shelf";
  }
}

function getInstalledVersion(pm: "pnpm" | "npm" | "yarn"): string | null {
  try {
    const cmd =
      pm === "yarn" ? "yarn global list --depth=0 2>&1" : `${pm} list -g ai-shelf --depth=0 2>&1`;
    const output = execSync(cmd, { encoding: "utf-8" });
    const match = output.match(/ai-shelf@(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { run } from "../utils/exec.js";
import { detectAll } from "../inventory/index.js";

const TOOL_UPDATE: Record<string, { cmd: string; args: string[]; label: string }> = {
  claude: { cmd: "claude", args: ["update"], label: "Claude Code" },
  copilot: { cmd: "copilot", args: ["update"], label: "GitHub Copilot CLI" },
  cursor: { cmd: "agent", args: ["update"], label: "Cursor" },
  "cursor-agent": { cmd: "agent", args: ["update"], label: "Cursor Agent" },
  agent: { cmd: "agent", args: ["update"], label: "Cursor Agent" },
};

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

  const result = await run(cfg.cmd, cfg.args);
  if (result.ok) {
    console.log(`✅ ${cfg.label} updated successfully`);
    if (result.stdout.trim()) console.log(result.stdout.trim());
  } else {
    console.error(`❌ ${cfg.label} update failed`);
    if (result.stderr.trim()) console.error(result.stderr.trim());
  }
}

async function updateSelf() {
  const currentVersion = getCurrentVersion();
  console.log(`\n🔄 Updating ai-cli-inventory (current: ${currentVersion})…`);

  const pm = detectPackageManager();
  const cmd = buildUpdateCommand(pm);
  console.log(`   $ ${cmd}\n`);

  try {
    execSync(cmd, { stdio: "inherit" });
    const newVersion = getInstalledVersion(pm);
    if (newVersion && newVersion !== currentVersion) {
      console.log(`✅ Updated ai-cli-inventory ${currentVersion} → ${newVersion}`);
    } else {
      console.log(`✅ ai-cli-inventory already up to date (${currentVersion})`);
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

  for (const pm of ["pnpm", "yarn", "npm"] as const) {
    try {
      execSync(`${pm} --version`, { stdio: "ignore" });
      return pm;
    } catch { /* not available */ }
  }
  return "npm";
}

function buildUpdateCommand(pm: "pnpm" | "npm" | "yarn"): string {
  switch (pm) {
    case "pnpm": return "pnpm update -g ai-cli-inventory";
    case "yarn": return "yarn global upgrade ai-cli-inventory";
    case "npm": return "npm update -g ai-cli-inventory";
  }
}

function getInstalledVersion(pm: "pnpm" | "npm" | "yarn"): string | null {
  try {
    const cmd = pm === "yarn"
      ? "yarn global list --depth=0 2>&1"
      : `${pm} list -g ai-cli-inventory --depth=0 2>&1`;
    const output = execSync(cmd, { encoding: "utf-8" });
    const match = output.match(/ai-cli-inventory@(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

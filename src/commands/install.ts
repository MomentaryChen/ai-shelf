import { execSync } from "node:child_process";
import { platform } from "node:os";
import { run } from "../utils/exec.js";
import {
  canonicalToolId,
  formatInstallCommand,
  getToolInstallSpec,
  INVENTORY_TOOL_IDS,
  type ToolInstallSpec,
  toolInstallRunnable,
} from "../tools.js";

function installShell(spec: ToolInstallSpec, os: NodeJS.Platform): string {
  if (os === "win32") {
    if (spec.shellKind === "powershell") return "powershell.exe";
    return process.env.ComSpec ?? "cmd.exe";
  }
  return "/bin/sh";
}

export async function runInstall(args: string[]) {
  const target = args[0];
  if (!target) {
    console.error("❌ Missing tool name");
    console.log(`   Usage: ai install <tool>`);
    console.log(`   Tools: claude, copilot, cursor, codex, gemini, aider, opencode, crush, goose`);
    process.exit(1);
  }

  const ok = await installTool(canonicalToolId(target));
  if (!ok) process.exit(1);
}

async function installTool(tool: string): Promise<boolean> {
  const os = platform();
  const spec = getToolInstallSpec(tool, os);
  if (!spec) {
    console.error(`❌ Unknown tool: ${tool}`);
    console.log(`   Available: ${INVENTORY_TOOL_IDS.join(", ")}`);
    return false;
  }

  const display = formatInstallCommand(spec);
  if (!toolInstallRunnable(spec)) {
    console.error(`❌ ${spec.label} must be installed from the official site.`);
    if (spec.url) console.log(`   ${spec.url}`);
    console.log(`   Suggested: ${display}`);
    return false;
  }

  console.log(`\n📦 Installing ${spec.label}…`);
  console.log(`   $ ${display}\n`);

  if (spec.shellLine) {
    try {
      execSync(spec.shellLine, {
        stdio: "inherit",
        timeout: 180_000,
        shell: installShell(spec, os),
        env: process.env,
      });
      console.log(`✅ ${spec.label} installed successfully`);
      return true;
    } catch {
      console.error(`❌ ${spec.label} install failed`);
      if (spec.url) console.error(`   Try the official guide: ${spec.url}`);
      return false;
    }
  }

  const result = await run(spec.cmd, spec.args, 180_000);
  if (result.ok) {
    console.log(`✅ ${spec.label} installed successfully`);
    if (result.stdout.trim()) console.log(result.stdout.trim());
    return true;
  }

  console.error(`❌ ${spec.label} install failed`);
  const err = result.stderr.trim() || result.stdout.trim();
  if (err) console.error(err);
  if (spec.url) console.error(`   Official guide: ${spec.url}`);
  return false;
}

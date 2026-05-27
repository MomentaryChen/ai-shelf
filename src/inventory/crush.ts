import type { DetectOptions, ProviderEntry } from "./types.js";
import { crushSkillRoots, withScannedSkills } from "./skills-scan.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";
import { join } from "node:path";

export async function detectCrush(_opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("crush", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? "")
    : undefined;

  const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? home(".config");
  const configCandidates = [
    cwd(".crush.json"),
    cwd("crush.json"),
    join(xdgConfig, "crush", "crush.json"),
  ];
  const instructionCandidates = [
    cwd("AGENTS.md"),
    cwd("CLAUDE.md"),
  ];

  const scanned = withScannedSkills(crushSkillRoots());

  return {
    tool: "crush",
    provider: "Charm Crush",
    version,
    available,
    auth: available ? "ok" : "unknown",
    skills: scanned.skills,
    skillDetails: scanned.skillDetails,
    mcp: {
      supported: true,
      servers: [],
      configPaths: [],
    },
    capabilities: {
      contextTokens: 200_000,
      streaming: true,
      toolCalls: true,
    },
    config: {
      paths: findExistingPaths(configCandidates),
      instructionFiles: findExistingPaths(instructionCandidates),
    },
    recommendation: available
      ? undefined
      : "Install: https://github.com/charmbracelet/crush",
  };
}

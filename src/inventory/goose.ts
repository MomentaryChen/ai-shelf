import type { DetectOptions, ProviderEntry } from "./types.js";
import { gooseSkillRoots, withScannedSkills } from "./skills-scan.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, xdgConfigHome } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";

export async function detectGoose(_opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("goose", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? "")
    : undefined;

  const configCandidates = [
    xdgConfigHome("goose", "config.yaml"),
    home(".goose", "config.yaml"),
  ];
  const instructionCandidates = [
    cwd("AGENTS.md"),
    cwd("CLAUDE.md"),
  ];

  const scanned = withScannedSkills(gooseSkillRoots());

  return {
    tool: "goose",
    provider: "Block Goose",
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
      : "Install: https://block.github.io/goose/",
  };
}

import { MCP_SYNC_TOOL_IDS, SKILL_SYNC_TOOL_IDS } from "../tools.js";
import { filterAllowedMcpNames, filterAllowedSkillNames, type TeamPolicy } from "../shared/team-policy.js";
import { readMcpServers } from "./mcp-sync.js";
import { readSkillsForTool } from "./skills-sync.js";

export type ConfigAlignGap = {
  kind: "mcp" | "skill";
  name: string;
  sourceTool: string;
  missingIn: string[];
};

function resolveMcpSource(policy: TeamPolicy, override?: string): string {
  return override || policy.sourceOfTruth?.mcp || "claude";
}

function resolveSkillsSource(policy: TeamPolicy, override?: string): string {
  return override || policy.sourceOfTruth?.skills || "claude";
}

/** Names present on sourceTool but missing on a target. */
export function mcpMissingFromTargets(opts: {
  sourceTool: string;
  targetTools: string[];
  policy?: TeamPolicy;
}): { serverNames: string[]; byTarget: Record<string, string[]> } {
  const sourceServers = Object.keys(readMcpServers(opts.sourceTool));
  const allowed = opts.policy
    ? filterAllowedMcpNames(opts.policy, sourceServers)
    : sourceServers;
  const byTarget: Record<string, string[]> = {};
  const allMissing = new Set<string>();

  for (const target of opts.targetTools) {
    if (target === opts.sourceTool) continue;
    const present = new Set(Object.keys(readMcpServers(target)));
    const missing = allowed.filter((name) => !present.has(name)).sort();
    byTarget[target] = missing;
    for (const name of missing) allMissing.add(name);
  }

  return { serverNames: [...allMissing].sort(), byTarget };
}

export function skillsMissingFromTargets(opts: {
  sourceTool: string;
  targetTools: string[];
  policy?: TeamPolicy;
}): { skillNames: string[]; byTarget: Record<string, string[]> } {
  const sourceSkills = Object.keys(readSkillsForTool(opts.sourceTool));
  const allowed = opts.policy
    ? filterAllowedSkillNames(opts.policy, sourceSkills)
    : sourceSkills;
  const byTarget: Record<string, string[]> = {};
  const allMissing = new Set<string>();

  for (const target of opts.targetTools) {
    if (target === opts.sourceTool) continue;
    const present = new Set(Object.keys(readSkillsForTool(target)));
    const missing = allowed.filter((name) => !present.has(name)).sort();
    byTarget[target] = missing;
    for (const name of missing) allMissing.add(name);
  }

  return { skillNames: [...allMissing].sort(), byTarget };
}

/** Build a flat gap list for the align overview UI. */
export function buildConfigAlignGaps(opts: {
  policy: TeamPolicy;
  mcpSourceTool?: string;
  skillsSourceTool?: string;
  mcpTargets?: string[];
  skillTargets?: string[];
}): ConfigAlignGap[] {
  const mcpSource = resolveMcpSource(opts.policy, opts.mcpSourceTool);
  const skillsSource = resolveSkillsSource(opts.policy, opts.skillsSourceTool);
  const mcpTargets = (opts.mcpTargets ?? [...MCP_SYNC_TOOL_IDS]).filter((t) => t !== mcpSource);
  const skillTargets = (opts.skillTargets ?? [...SKILL_SYNC_TOOL_IDS]).filter(
    (t) => t !== skillsSource,
  );

  const gaps: ConfigAlignGap[] = [];
  const mcp = mcpMissingFromTargets({
    sourceTool: mcpSource,
    targetTools: mcpTargets,
    policy: opts.policy,
  });
  for (const name of mcp.serverNames) {
    const missingIn = mcpTargets.filter((t) => mcp.byTarget[t]?.includes(name));
    if (missingIn.length) {
      gaps.push({ kind: "mcp", name, sourceTool: mcpSource, missingIn });
    }
  }

  const skills = skillsMissingFromTargets({
    sourceTool: skillsSource,
    targetTools: skillTargets,
    policy: opts.policy,
  });
  for (const name of skills.skillNames) {
    const missingIn = skillTargets.filter((t) => skills.byTarget[t]?.includes(name));
    if (missingIn.length) {
      gaps.push({ kind: "skill", name, sourceTool: skillsSource, missingIn });
    }
  }

  return gaps;
}

export { resolveMcpSource, resolveSkillsSource };

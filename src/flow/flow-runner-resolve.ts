import { homedir } from "node:os";
import { bootstrap } from "ai-shelf";
import type { FlowDefinition, FlowPhaseDef } from "../shared/flow-types.js";
import { applyFlowClaudeDefaultModel } from "../shared/claude-tool-args.js";
import {
  buildToolLaunchCommand,
  resolveToolLaunchCommand,
  type ToolLaunchArgs,
} from "../tool-launch.js";
import { TOOL_LAUNCH_CMD, canonicalToolId } from "../tools.js";
import { flowAgentSupportsMcp } from "../shared/flow-runner-tools.js";
import { buildFlowRunnerEnv } from "../shared/flow-env.js";

export { flowAgentSupportsMcp, FLOW_MCP_AGENT_TOOLS } from "../shared/flow-runner-tools.js";

export type ResolvedFlowRunner = {
  tool: string;
  /** Base command including per-flow / global tool args (before `-p`). */
  launchCommand: string;
  cwd: string;
  /** Extra env for the agent process (flow `env:` + bound profile vars). */
  env: Record<string, string>;
  /** Resolved Terminal profile id, when one is bound to the flow or phase. */
  profileId?: string;
};

export function expandFlowPath(template: string): string {
  return template.replace(/^~(?=\/|\\)/, homedir());
}

function resolveProfileDefaults(
  profileId: string,
): { id: string; name: string; cwd?: string; tool?: string } | null {
  try {
    const ctx = bootstrap();
    const profile = ctx.profileService.findProfile(profileId);
    return {
      id: profile.id,
      name: profile.name,
      cwd: profile.defaultCwd,
      tool: profile.defaultTool !== "shell" ? profile.defaultTool : undefined,
    };
  } catch {
    return null;
  }
}

export type ResolveFlowRunnerOptions = {
  globalToolLaunchArgs?: ToolLaunchArgs;
  /** Override tool for a single phase (orchestration). */
  phaseTool?: string;
  /** Override tool_args for a single phase. */
  phaseToolArgs?: string;
  /** Override the bound Terminal profile for a single phase. */
  phaseProfileId?: string;
};

export function resolveFlowRunner(
  flow: FlowDefinition,
  options: ResolveFlowRunnerOptions = {},
): ResolvedFlowRunner | { error: string } {
  if (flow.runner !== "claude") {
    return { error: "Runner environment applies only to agent (claude) flows" };
  }

  let tool = options.phaseTool?.trim() || flow.agentTool || "claude";
  let cwd = flow.cwd?.trim() || "";

  const phaseProfile = options.phaseProfileId?.trim();
  const profileRef = phaseProfile || flow.profileId?.trim();
  let profileBinding: { id: string; name: string } | null = null;
  if (profileRef) {
    const fromProfile = resolveProfileDefaults(profileRef);
    if (!fromProfile) {
      return { error: `Profile not found: ${profileRef}` };
    }
    profileBinding = { id: fromProfile.id, name: fromProfile.name };
    // A phase-level profile wins over the flow cwd; the flow profile only fills gaps.
    if ((phaseProfile || !flow.cwd?.trim()) && fromProfile.cwd) cwd = fromProfile.cwd;
    const toolInherits = phaseProfile ? true : flow.profileInheritsTool;
    if (!options.phaseTool?.trim() && toolInherits && fromProfile.tool) {
      tool = fromProfile.tool;
    }
  }

  if (!cwd) cwd = process.cwd();
  cwd = expandFlowPath(cwd);

  const canonical = canonicalToolId(tool);
  if (!flowAgentSupportsMcp(canonical)) {
    return {
      error: `Tool "${tool}" is not supported for AI Flow yet. Use claude, cursor, codex, or gemini.`,
    };
  }

  const launchBase =
    canonical === "cursor"
      ? (TOOL_LAUNCH_CMD.agent ?? "agent")
      : (TOOL_LAUNCH_CMD[canonical] ?? TOOL_LAUNCH_CMD[tool]);
  if (!launchBase) {
    return { error: `Unknown tool: ${tool}` };
  }

  const globalExtra = options.globalToolLaunchArgs
    ? (options.globalToolLaunchArgs[canonical] ??
        options.globalToolLaunchArgs[tool] ??
        (canonical === "cursor" ? options.globalToolLaunchArgs.agent : undefined) ??
        options.globalToolLaunchArgs.agent)
    : undefined;

  const phaseExtra = options.phaseToolArgs?.trim();
  const flowExtra = phaseExtra !== undefined ? phaseExtra : flow.toolArgs?.trim();
  let mergedExtra = [globalExtra?.trim(), flowExtra].filter(Boolean).join(" ");
  if (canonical === "claude") {
    mergedExtra = applyFlowClaudeDefaultModel(mergedExtra);
  }
  const launchCommand =
    resolveToolLaunchCommand(canonical === "cursor" ? "agent" : tool, mergedExtra) ??
    buildToolLaunchCommand(launchBase, mergedExtra);

  const env = buildFlowRunnerEnv({
    flowEnv: flow.env,
    profile: profileBinding,
    baseEnv: process.env,
  });

  return {
    tool: canonical,
    launchCommand,
    cwd,
    env,
    ...(profileBinding ? { profileId: profileBinding.id } : {}),
  };
}

/** Resolve runner for one orchestrated phase (inherits flow defaults). */
export function resolvePhaseRunner(
  flow: FlowDefinition,
  phase: FlowPhaseDef,
  options: { globalToolLaunchArgs?: ToolLaunchArgs } = {},
): ResolvedFlowRunner | { error: string } {
  return resolveFlowRunner(flow, {
    globalToolLaunchArgs: options.globalToolLaunchArgs,
    phaseTool: phase.tool,
    phaseToolArgs: phase.toolArgs,
    phaseProfileId: phase.profileId,
  });
}

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

export { flowAgentSupportsMcp, FLOW_MCP_AGENT_TOOLS } from "../shared/flow-runner-tools.js";

export type ResolvedFlowRunner = {
  tool: string;
  /** Base command including per-flow / global tool args (before `-p`). */
  launchCommand: string;
  cwd: string;
};

export function expandFlowPath(template: string): string {
  return template.replace(/^~(?=\/|\\)/, homedir());
}

function resolveProfileDefaults(profileId: string): { cwd?: string; tool?: string } | null {
  try {
    const ctx = bootstrap();
    const profile = ctx.profileService.findProfile(profileId);
    return {
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

  if (flow.profileId?.trim()) {
    const fromProfile = resolveProfileDefaults(flow.profileId.trim());
    if (!fromProfile) {
      return { error: `Profile not found: ${flow.profileId}` };
    }
    if (!flow.cwd?.trim() && fromProfile.cwd) cwd = fromProfile.cwd;
    if (!options.phaseTool?.trim() && flow.profileInheritsTool && fromProfile.tool) {
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

  return { tool: canonical, launchCommand, cwd };
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
  });
}

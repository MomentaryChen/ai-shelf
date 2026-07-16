import { canonicalToolId } from "../tools.js";

/**
 * Agent tools supported by AI Flow (print mode).
 * Claude/Cursor get full MCP (`flow_progress` / `flow_output`);
 * Codex/Gemini use stdout `FLOW_PROGRESS` / `FLOW_OUTPUT_BEGIN` protocol.
 */
export const FLOW_MCP_AGENT_TOOLS = ["claude", "cursor", "codex", "gemini"] as const;

export type FlowMcpAgentTool = (typeof FLOW_MCP_AGENT_TOOLS)[number];

/** Tools that mount the `ai-shelf-flow` MCP server. */
export const FLOW_FULL_MCP_AGENT_TOOLS = ["claude", "cursor"] as const;

/** Runner picker ids — inventory lists Cursor as `agent`. */
export const FLOW_RUNNER_PICKER_TOOL_IDS = ["claude", "agent", "codex", "gemini"] as const;

export function flowAgentSupportsMcp(tool: string): boolean {
  return (FLOW_MCP_AGENT_TOOLS as readonly string[]).includes(canonicalToolId(tool));
}

export function flowAgentSupportsFullMcp(tool: string): boolean {
  return (FLOW_FULL_MCP_AGENT_TOOLS as readonly string[]).includes(canonicalToolId(tool));
}

export function isFlowRunnerPickerTool(tool: string): boolean {
  return flowAgentSupportsMcp(tool);
}

/** AI Flow runner UI: Claude, Cursor, Codex, Gemini. */
export function flowRunnerPickerToolIds(...extra: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...FLOW_RUNNER_PICKER_TOOL_IDS, ...extra]) {
    if (!id || seen.has(id)) continue;
    if (!isFlowRunnerPickerTool(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : [...FLOW_RUNNER_PICKER_TOOL_IDS];
}

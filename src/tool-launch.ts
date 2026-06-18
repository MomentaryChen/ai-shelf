import { TOOL_LAUNCH_CMD } from "./tools.js";

/** Map alternate inventory / launch ids to the settings key users edit. */
const TOOL_LAUNCH_ARG_ALIASES: Record<string, string> = {
  agent: "cursor",
  "cursor-agent": "cursor",
};

export type ToolLaunchArgs = Record<string, string>;

/** Append user-configured CLI flags to the base launch command. */
export function buildToolLaunchCommand(baseCmd: string, extraArgs?: string): string {
  const base = baseCmd.trim();
  const extra = (extraArgs ?? "").trim();
  if (!extra) return base;
  if (!base) return extra;
  return `${base} ${extra}`;
}

export function resolveToolLaunchExtraArgs(
  args: ToolLaunchArgs | undefined,
  tool: string,
): string | undefined {
  if (!args) return undefined;
  const direct = args[tool]?.trim();
  if (direct) return direct;
  const canonical = TOOL_LAUNCH_ARG_ALIASES[tool];
  if (canonical) {
    const aliased = args[canonical]?.trim();
    if (aliased) return aliased;
  }
  return undefined;
}

export function resolveToolLaunchCommand(tool: string, extraArgs?: string): string | null {
  const base = TOOL_LAUNCH_CMD[tool];
  if (!base) return null;
  return buildToolLaunchCommand(base, extraArgs);
}

export function normalizeToolLaunchArgs(raw: unknown): ToolLaunchArgs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ToolLaunchArgs = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

import type { ProfileInfo } from "../types";
import { PLAIN_SHELL_TOOL_ID } from "./available-tools";

export type ProfileStartFrom =
  | "blank"
  | "template-solo"
  | "template-multi"
  | "template-shell"
  | "copy";

export interface ProfileCreateDefaults {
  copyNameSource?: string;
  defaultCwd: string;
  defaultTool: string;
  accentColor: string | null;
  broadcastInput: boolean;
  copyFromProfileId?: string;
}

export function profileCreateDefaults(
  startFrom: ProfileStartFrom,
  profiles: ProfileInfo[],
  copyFromProfileId: string | null,
  tools: string[],
): ProfileCreateDefaults {
  const fallbackTool = tools[0] ?? PLAIN_SHELL_TOOL_ID;

  if (startFrom === "copy" && copyFromProfileId) {
    const source = profiles.find((p) => p.id === copyFromProfileId);
    if (source) {
      const tool = tools.includes(source.defaultTool)
        ? source.defaultTool
        : fallbackTool;
      return {
        copyNameSource: source.name,
        defaultCwd: source.defaultCwd ?? "",
        defaultTool: tool,
        accentColor: source.accentColor ?? null,
        broadcastInput: source.broadcastInput ?? false,
        copyFromProfileId: source.id,
      };
    }
  }

  if (startFrom === "template-solo") {
    const tool = tools.includes("claude") ? "claude" : fallbackTool;
    return {
      defaultCwd: "",
      defaultTool: tool,
      accentColor: null,
      broadcastInput: false,
    };
  }

  if (startFrom === "template-multi") {
    const tool = tools.includes("claude") ? "claude" : fallbackTool;
    return {
      defaultCwd: "",
      defaultTool: tool,
      accentColor: null,
      broadcastInput: true,
    };
  }

  if (startFrom === "template-shell") {
    const tool = tools.includes(PLAIN_SHELL_TOOL_ID)
      ? PLAIN_SHELL_TOOL_ID
      : fallbackTool;
    return {
      defaultCwd: "",
      defaultTool: tool,
      accentColor: null,
      broadcastInput: false,
    };
  }

  return {
    defaultCwd: "",
    defaultTool: fallbackTool,
    accentColor: null,
    broadcastInput: false,
  };
}

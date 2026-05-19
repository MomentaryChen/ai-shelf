import type { ProviderEntry } from "../types";
import { toolDisplayName } from "../../tool-sort.js";

/** Profile default: interactive shell only, no AI CLI launched on spawn. */
export const PLAIN_SHELL_TOOL_ID = "shell";

export function isPlainShellTool(tool: string): boolean {
  return tool === PLAIN_SHELL_TOOL_ID;
}

/** Tool ids from inventory scan, in display order (available only). */
export function toolIdsFromInventory(data: ProviderEntry[]): string[] {
  return data.filter((e) => e.available).map((e) => e.tool);
}

/** Merge scan results with extra ids (e.g. profile default) without duplicates. */
export function mergeToolIds(available: string[], ...extra: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...available, ...extra]) {
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Default-tool picker: plain shell first, then detected AI tools. */
export function profileToolChoices(available: string[], ...extra: (string | undefined)[]): string[] {
  return mergeToolIds([PLAIN_SHELL_TOOL_ID, ...available], ...extra);
}

export function profileToolLabel(tool: string): string {
  if (isPlainShellTool(tool)) return "純終端機（不開 AI）";
  return toolDisplayName(tool);
}

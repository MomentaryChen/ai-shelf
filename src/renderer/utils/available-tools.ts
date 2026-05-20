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

/** Default-tool picker: plain shell first, then installed AI tools only. */
export function profileToolChoices(available: string[], ...extra: (string | undefined)[]): string[] {
  const installed = new Set(available);
  const extras = extra.filter(
    (id): id is string =>
      !!id && (isPlainShellTool(id) || installed.has(id)),
  );
  return mergeToolIds([PLAIN_SHELL_TOOL_ID, ...available], ...extras);
}

/** Pick a tool id that can actually be launched in Terminal (falls back to shell). */
export function resolveLaunchTool(tool: string | undefined, available: string[]): string {
  if (!tool || isPlainShellTool(tool)) return PLAIN_SHELL_TOOL_ID;
  return available.includes(tool) ? tool : PLAIN_SHELL_TOOL_ID;
}

export function profileToolLabel(tool: string): string {
  if (isPlainShellTool(tool)) return "純終端機（不開 AI）";
  return toolDisplayName(tool);
}

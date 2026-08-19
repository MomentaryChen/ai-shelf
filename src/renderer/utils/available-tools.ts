import type { ProviderEntry } from "../types";
import { TOOL_LAUNCH_CMD } from "../../tools.js";
import { toolDisplayName } from "../../tool-sort.js";
import { getStoredT } from "../i18n/stored-locale.js";

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

/**
 * Pick the tool to spawn for a pane.
 * Named AI CLIs stay as-is even if inventory has not listed them yet — falling
 * back to shell made the UI show Claude while Windows opened cmd.exe.
 */
export function resolveLaunchTool(tool: string | undefined, available: string[]): string {
  if (!tool || isPlainShellTool(tool)) return PLAIN_SHELL_TOOL_ID;
  if (available.includes(tool) || tool in TOOL_LAUNCH_CMD) return tool;
  return PLAIN_SHELL_TOOL_ID;
}

/**
 * Shell preference passed to PTY spawn.
 * Interactive (plain shell) panes honor cmd / external-terminal mapping.
 * AI CLI panes never force cmd — that host always exists, so npm shims never
 * get a chance to run under pwsh and the pane looks like Command Prompt.
 */
export function resolveEmbeddedPtyShell(
  preferredShell: string,
  externalTerminal: string,
  tool: string,
): string {
  const launchingTool = Boolean(tool && !isPlainShellTool(tool));
  if (preferredShell !== "auto") {
    if (launchingTool && preferredShell === "cmd") return "auto";
    return preferredShell;
  }
  if (launchingTool) return "auto";
  if (
    externalTerminal === "pwsh" ||
    externalTerminal === "powershell" ||
    externalTerminal === "cmd"
  ) {
    return externalTerminal;
  }
  return "auto";
}

export function profileToolLabel(tool: string): string {
  if (isPlainShellTool(tool)) return getStoredT("profile.tool.plainShell");
  return toolDisplayName(tool);
}

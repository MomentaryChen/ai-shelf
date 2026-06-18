/** Shared tool ids and launch/update metadata used across CLI, Electron, and packages/cli. */

export const INVENTORY_TOOL_IDS = [
  "claude",
  "copilot",
  "cursor",
  "codex",
  "gemini",
  "aider",
  "opencode",
  "crush",
  "goose",
] as const;

export type InventoryToolId = (typeof INVENTORY_TOOL_IDS)[number];

/**
 * Tools whose MCP config supports cross-tool MCP sync.
 * Excludes aider (no MCP). New tools (e.g. Goose, Crush) should prefer JSON MCP
 * configs to keep sync adaptation cost low; Codex uses TOML via mcp-codex-toml.
 */
export const MCP_SYNC_TOOL_IDS = [
  "claude",
  "copilot",
  "cursor",
  "codex",
  "gemini",
  "opencode",
] as const;

/**
 * Normalize a tool identifier to its canonical inventory id.
 * Cursor is detected via its `agent` command, so its entry's `tool` field is
 * `"agent"`; map that (and `cursor-agent`) back to `"cursor"` so config-path
 * and MCP lookups resolve consistently.
 */
export function canonicalToolId(tool: string): string {
  if (tool === "agent" || tool === "cursor-agent") return "cursor";
  return tool;
}

export const TOOL_LAUNCH_CMD: Record<string, string> = {
  claude: "claude",
  copilot: "copilot",
  cursor: "cursor",
  "cursor-agent": "agent",
  agent: "agent",
  codex: "codex",
  gemini: "gemini",
  aider: "aider",
  opencode: "opencode",
  crush: "crush",
  goose: "goose",
};

export const TOOL_UPDATE: Record<string, { cmd: string; args: string[]; label: string }> = {
  claude: { cmd: "claude", args: ["update"], label: "Claude Code" },
  copilot: { cmd: "copilot", args: ["update"], label: "GitHub Copilot CLI" },
  cursor: { cmd: "agent", args: ["update"], label: "Cursor" },
  "cursor-agent": { cmd: "agent", args: ["update"], label: "Cursor Agent" },
  agent: { cmd: "agent", args: ["update"], label: "Cursor Agent" },
  codex: { cmd: "codex", args: ["upgrade"], label: "OpenAI Codex" },
  gemini: { cmd: "gemini", args: ["update"], label: "Google Gemini CLI" },
  aider: { cmd: "pip", args: ["install", "-U", "aider-chat"], label: "Aider" },
  opencode: { cmd: "opencode", args: ["upgrade"], label: "OpenCode" },
  crush: { cmd: "crush", args: ["upgrade"], label: "Crush" },
  goose: { cmd: "goose", args: ["update"], label: "Goose" },
};

export const TOOL_NPM_PACKAGE: Record<string, string> = {
  claude: "@anthropic-ai/claude-code",
  copilot: "@github/copilot",
  codex: "@openai/codex",
  gemini: "@google/gemini-cli",
};

/** Tools without an npm registry entry — latest is inferred after a successful update check. */
export function toolHasNpmLatest(tool: string): boolean {
  return tool in TOOL_NPM_PACKAGE;
}

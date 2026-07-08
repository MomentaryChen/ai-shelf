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

/** Tools whose SKILL.md directories support cross-tool skills sync. */
export const SKILL_SYNC_TOOL_IDS = [
  "claude",
  "cursor",
  "gemini",
  "crush",
  "goose",
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

/** Non-npm tools whose latest version comes from GitHub Releases (`owner/repo`). */
export const TOOL_GITHUB_REPO: Record<string, string> = {
  aider: "Aider-AI/aider",
  opencode: "anomalyco/opencode",
  crush: "charmbracelet/crush",
  goose: "block/goose",
};

/** Tools without an npm registry entry — latest is inferred after a successful update check. */
export function toolHasNpmLatest(tool: string): boolean {
  return tool in TOOL_NPM_PACKAGE;
}

/** Tools that can resolve latest version from npm or GitHub Releases. */
export function toolHasRemoteLatest(tool: string): boolean {
  const id = canonicalToolId(tool);
  return id in TOOL_NPM_PACKAGE || id in TOOL_GITHUB_REPO;
}

export type ToolInstallSpec = {
  cmd: string;
  args: string[];
  label: string;
  url?: string;
  /** Run the full line in a shell (pipes, curl | bash, PowerShell irm). */
  shellLine?: string;
  /** UI / log display; defaults to shellLine or joined cmd + args. */
  display?: string;
  /** Windows shell installs that need PowerShell (irm | iex), not cmd.exe. */
  shellKind?: "powershell";
};

const TOOL_INSTALL: Record<string, ToolInstallSpec> = {
  claude: {
    cmd: "npm",
    args: ["install", "-g", "@anthropic-ai/claude-code"],
    label: "Claude Code",
    url: "https://claude.ai/code",
  },
  copilot: {
    cmd: "gh",
    args: ["extension", "install", "github/gh-copilot"],
    label: "GitHub Copilot CLI",
    url: "https://github.com/github/gh-copilot",
  },
  cursor: {
    cmd: "",
    args: [],
    label: "Cursor",
    url: "https://cursor.sh",
  },
  codex: {
    cmd: "npm",
    args: ["install", "-g", "@openai/codex"],
    label: "OpenAI Codex",
    url: "https://developers.openai.com/codex/cli/",
  },
  gemini: {
    cmd: "npm",
    args: ["install", "-g", "@google/gemini-cli"],
    label: "Google Gemini CLI",
    url: "https://github.com/google-gemini/gemini-cli",
  },
  aider: {
    cmd: "pip",
    args: ["install", "-U", "aider-chat"],
    label: "Aider",
    url: "https://aider.chat/",
  },
  opencode: {
    cmd: "npm",
    args: ["install", "-g", "opencode-ai@latest"],
    label: "OpenCode",
    url: "https://opencode.ai/docs/",
  },
  crush: {
    cmd: "go",
    args: ["install", "github.com/charmbracelet/crush@latest"],
    label: "Crush",
    url: "https://github.com/charmbracelet/crush",
  },
  goose: {
    cmd: "",
    args: [],
    label: "Goose",
    url: "https://block.github.io/goose/docs/getting-started/installation",
  },
};

export function formatInstallCommand(spec: ToolInstallSpec): string {
  return spec.display ?? spec.shellLine ?? [spec.cmd, ...spec.args].filter(Boolean).join(" ");
}

/** Whether `runInstall` can execute this spec (vs. website-only guidance). */
export function toolInstallRunnable(spec: ToolInstallSpec): boolean {
  return !!(spec.shellLine || spec.cmd);
}

/** Resolve platform-specific install command for a tool (npm -g, winget, official script, …). */
export function getToolInstallSpec(tool: string, os: NodeJS.Platform): ToolInstallSpec | null {
  const id = canonicalToolId(tool);
  const base = TOOL_INSTALL[id];
  if (!base) return null;

  if (id === "goose") {
    if (os === "win32") {
      const shellLine = "irm https://github.com/block/goose/raw/main/download_cli.ps1 | iex";
      return { ...base, shellLine, display: shellLine, shellKind: "powershell" };
    }
    const shellLine =
      "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash";
    return { ...base, shellLine, display: shellLine };
  }

  if (id === "opencode") {
    if (os === "win32") {
      return {
        ...base,
        cmd: "npm",
        args: ["install", "-g", "opencode-ai@latest"],
        display: "npm install -g opencode-ai@latest",
      };
    }
    const shellLine = "curl -fsSL https://opencode.ai/install | bash";
    return { ...base, shellLine, display: shellLine };
  }

  if (id === "cursor") {
    if (os === "win32") {
      return {
        ...base,
        cmd: "winget",
        args: [
          "install",
          "Anysphere.Cursor",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ],
        display: "winget install Anysphere.Cursor",
      };
    }
    if (os === "darwin") {
      return {
        ...base,
        cmd: "brew",
        args: ["install", "--cask", "cursor"],
        display: "brew install --cask cursor",
      };
    }
    return { ...base, display: "Download from cursor.sh" };
  }

  return { ...base, display: formatInstallCommand(base) };
}

import type { ReactNode } from "react";
import { ToolLogo } from "./components/ToolLogo";

import { toolDisplayName } from "../tool-sort.js";

type InstallInfo = { cmd: string; url: string };

const TOOL_INSTALL: Record<string, InstallInfo> = {
  claude: {
    cmd: "npm install -g @anthropic-ai/claude-code",
    url: "https://claude.ai/code",
  },
  copilot: {
    cmd: "gh extension install github/gh-copilot",
    url: "https://github.com/github/gh-copilot",
  },
  cursor: {
    cmd: "winget install Anysphere.Cursor",
    url: "https://cursor.sh",
  },
  "cursor-agent": {
    cmd: "winget install Anysphere.Cursor",
    url: "https://cursor.sh",
  },
  agent: {
    cmd: "winget install Anysphere.Cursor",
    url: "https://cursor.sh",
  },
};

export function toolInstall(tool: string): InstallInfo | null {
  return TOOL_INSTALL[tool] ?? null;
}

export function toolIcon(tool: string): ReactNode {
  return <ToolLogo tool={tool} size={18} />;
}

export function toolLabel(tool: string) {
  return toolDisplayName(tool);
}

export function formatContext(tokens?: number) {
  return tokens ? `${Math.round(tokens / 1000)}k` : "—";
}

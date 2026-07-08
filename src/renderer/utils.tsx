import type { ReactNode } from "react";
import { ToolLogo } from "./components/ToolLogo";

import { toolDisplayName } from "../tool-sort.js";
import { formatInstallCommand, getToolInstallSpec } from "../tools.js";
import { installPlatform } from "./utils/install-platform.js";

type InstallInfo = { cmd: string; url: string };

export function toolInstall(tool: string): InstallInfo | null {
  const spec = getToolInstallSpec(tool, installPlatform());
  if (!spec) return null;
  return {
    cmd: formatInstallCommand(spec),
    url: spec.url ?? "",
  };
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

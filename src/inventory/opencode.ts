import type { DetectOptions, ProviderEntry } from "./types.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, tryReadJson } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";
import { collectMcpServersFromJsonFiles } from "./mcp-helpers.js";
import { join } from "node:path";

const OPENCODE_MODELS = [
  "claude-sonnet-4-6",
  "claude-3-5-sonnet-20241022",
  "gpt-4.1",
  "gpt-4o",
  "gemini-2.5-pro",
];

export async function detectOpenCode(_opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("opencode", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? versionResult.stderr.split("\n")[0] ?? "")
    : undefined;

  const globalConfig = join(home(".config", "opencode"), "opencode.json");
  const projectConfig = cwd("opencode.json");
  const configCandidates = [globalConfig, projectConfig];
  const instructionCandidates = [cwd("AGENTS.md"), cwd("OPENCODE.md")];
  const mcpCandidates = [globalConfig, projectConfig];

  const { servers: mcpServers, configPaths: mcpConfigPaths } = collectMcpServersFromJsonFiles(
    mcpCandidates,
    "mcpServers",
  );

  const settings =
    tryReadJson<Record<string, unknown>>(projectConfig) ??
    tryReadJson<Record<string, unknown>>(globalConfig);
  const modelSetting = settings?.["model"];
  const modelFromConfig =
    typeof modelSetting === "string"
      ? modelSetting
      : typeof modelSetting === "object" && modelSetting !== null && "id" in modelSetting
        ? String((modelSetting as { id: string }).id)
        : undefined;
  const model = available
    ? (modelFromConfig ?? "claude-sonnet-4-6")
    : modelFromConfig;

  const auth = available ? ("ok" as ProviderEntry["auth"]) : ("unknown" as ProviderEntry["auth"]);

  return {
    tool: "opencode",
    provider: "OpenCode",
    version,
    available,
    auth,
    model,
    models: available ? OPENCODE_MODELS : [],
    skills: ["coding", "bash", "file-edit", "mcp", "multi-provider"],
    mcp: {
      supported: true,
      servers: mcpServers,
      configPaths: mcpConfigPaths,
    },
    capabilities: {
      contextTokens: 200_000,
      streaming: true,
      toolCalls: true,
    },
    config: {
      paths: findExistingPaths(configCandidates),
      instructionFiles: findExistingPaths(instructionCandidates),
    },
    recommendation: available
      ? undefined
      : "Install: https://opencode.ai/docs/cli/",
  };
}

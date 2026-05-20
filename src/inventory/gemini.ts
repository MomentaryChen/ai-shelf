import type { DetectOptions, ProviderEntry } from "./types.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, envPresent, tryReadJson } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";
import { collectMcpServersFromJsonFiles } from "./mcp-helpers.js";

const GEMINI_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
];

export async function detectGemini(_opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("gemini", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? "")
    : undefined;

  const auth =
    envPresent("GEMINI_API_KEY") || envPresent("GOOGLE_API_KEY")
      ? ("ok" as ProviderEntry["auth"])
      : ("missing" as ProviderEntry["auth"]);

  const userSettings = home(".gemini", "settings.json");
  const projectSettings = cwd(".gemini", "settings.json");
  const configCandidates = [userSettings, projectSettings];
  const instructionCandidates = [
    cwd("GEMINI.md"),
    cwd("AGENTS.md"),
    home(".gemini", "GEMINI.md"),
  ];
  const mcpCandidates = [userSettings, projectSettings, cwd(".gemini", "settings.json")];

  const { servers: mcpServers, configPaths: mcpConfigPaths } = collectMcpServersFromJsonFiles(
    mcpCandidates,
    "mcpServers",
  );

  const settings =
    tryReadJson<Record<string, unknown>>(projectSettings) ??
    tryReadJson<Record<string, unknown>>(userSettings);
  const modelFromConfig =
    typeof settings?.["model"] === "string" && settings["model"].length > 0
      ? settings["model"]
      : undefined;
  const model = available
    ? (modelFromConfig ?? "gemini-2.5-pro")
    : modelFromConfig;

  return {
    tool: "gemini",
    provider: "Google Gemini",
    version,
    available,
    auth,
    model,
    models: available ? GEMINI_MODELS : [],
    skills: ["coding", "bash", "file-edit", "mcp", "research"],
    mcp: {
      supported: true,
      servers: mcpServers,
      configPaths: mcpConfigPaths,
    },
    capabilities: {
      contextTokens: 1_000_000,
      streaming: true,
      toolCalls: true,
      vision: true,
    },
    config: {
      paths: findExistingPaths(configCandidates),
      instructionFiles: findExistingPaths(instructionCandidates),
    },
    recommendation: available
      ? undefined
      : "Install: npm install -g @google/gemini-cli",
  };
}

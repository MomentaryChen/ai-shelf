import type { DetectOptions, ProviderEntry } from "./types.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, envPresent } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";
import { parseCodexMcpServers, parseCodexModel } from "./mcp-helpers.js";

const CODEX_MODELS = [
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5-mini",
  "o3",
  "o4-mini",
];

export async function detectCodex(_opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("codex", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? "")
    : undefined;

  const configPath = home(".codex", "config.toml");
  const projectConfigPath = cwd(".codex", "config.toml");

  const auth = envPresent("OPENAI_API_KEY")
    ? ("ok" as ProviderEntry["auth"])
    : available
      ? await run("codex", ["login", "status"], 5_000).then((r) => (r.ok ? "ok" : "missing") as ProviderEntry["auth"])
      : ("missing" as ProviderEntry["auth"]);

  const mcpCandidates = [configPath, projectConfigPath];
  const mcpConfigPaths = findExistingPaths(mcpCandidates);
  const mcpServers = [
    ...parseCodexMcpServers(configPath),
    ...parseCodexMcpServers(projectConfigPath),
  ];

  const modelFromConfig =
    parseCodexModel(configPath) ?? parseCodexModel(projectConfigPath);
  const model = available
    ? (modelFromConfig ?? "gpt-5.3-codex")
    : modelFromConfig;

  return {
    tool: "codex",
    provider: "OpenAI Codex",
    version,
    available,
    auth,
    model,
    models: available ? CODEX_MODELS : [],
    skills: [],
    skillDetails: [],
    mcp: {
      supported: true,
      servers: [...new Set(mcpServers)],
      configPaths: mcpConfigPaths,
    },
    capabilities: {
      contextTokens: 272_000,
      streaming: true,
      toolCalls: true,
    },
    config: {
      paths: mcpConfigPaths,
      instructionFiles: findExistingPaths([
        cwd("AGENTS.md"),
        cwd("CODEX.md"),
      ]),
    },
    recommendation: available
      ? undefined
      : "Install: npm install -g @openai/codex",
  };
}

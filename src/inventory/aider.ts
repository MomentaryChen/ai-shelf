import type { DetectOptions, ProviderEntry } from "./types.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, envPresent } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";
import { parseAiderModelFromYaml } from "./mcp-helpers.js";

const AIDER_MODELS = [
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-3-5-sonnet-20241022",
  "openai/gpt-4.1",
  "openai/gpt-4o",
  "openai/o3-mini",
  "deepseek/deepseek-chat",
];

function hasAiderAuth(): boolean {
  return (
    envPresent("ANTHROPIC_API_KEY") ||
    envPresent("OPENAI_API_KEY") ||
    envPresent("DEEPSEEK_API_KEY") ||
    envPresent("GEMINI_API_KEY") ||
    envPresent("OPENROUTER_API_KEY")
  );
}

export async function detectAider(_opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("aider", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? versionResult.stderr.split("\n")[0] ?? "")
    : undefined;

  const auth = hasAiderAuth() ? ("ok" as ProviderEntry["auth"]) : ("missing" as ProviderEntry["auth"]);

  const configCandidates = [
    home(".aider.conf.yml"),
    home(".aider.conf.yaml"),
    cwd(".aider.conf.yml"),
    cwd(".aider.conf.yaml"),
    cwd(".aider.conf"),
  ];
  const instructionCandidates = [
    cwd("CONVENTIONS.md"),
    cwd(".aider.md"),
    cwd("AGENTS.md"),
  ];

  const modelFromConfig =
    parseAiderModelFromYaml(home(".aider.conf.yml")) ??
    parseAiderModelFromYaml(home(".aider.conf.yaml")) ??
    parseAiderModelFromYaml(cwd(".aider.conf.yml")) ??
    parseAiderModelFromYaml(cwd(".aider.conf.yaml"));
  const model = available
    ? (modelFromConfig ?? "anthropic/claude-sonnet-4-6")
    : modelFromConfig;

  return {
    tool: "aider",
    provider: "Aider",
    version,
    available,
    auth,
    model,
    models: available ? AIDER_MODELS : [],
    skills: ["coding", "git", "diff-edit", "multi-file"],
    mcp: {
      supported: false,
      servers: [],
      configPaths: [],
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
      : "Install: pip install aider-chat",
  };
}

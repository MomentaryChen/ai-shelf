import type { ProviderEntry } from "./types.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, tryReadJson } from "../utils/config.js";

async function listClaudeModels(): Promise<string[]> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return [];

  const baseUrl = (process.env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com").replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/v1/models?limit=100`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { data: { id: string }[] };
    return data.data.map((m) => m.id).filter((id) => id.startsWith("claude-"));
  } catch {
    return [];
  }
}

export async function detectClaude(): Promise<ProviderEntry> {
  const versionResult = await run("claude", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available ? versionResult.stdout.split("\n")[0] : undefined;

  // Run auth check, model list, and config get in parallel
  const [authResult, cliModels, cfgResult] = await Promise.all([
    available
      ? run("claude", ["auth", "status", "--text"]).then((r) => r.ok ? "ok" : "missing" as ProviderEntry["auth"])
      : Promise.resolve(process.env["ANTHROPIC_API_KEY"] ? "ok" : "missing" as ProviderEntry["auth"]),
    listClaudeModels(),
    available ? run("claude", ["config", "get", "model"]) : Promise.resolve({ ok: false, stdout: "", stderr: "" }),
  ]);

  const auth = authResult;

  // Detect current default model: CLI first, then settings.json fallback
  let model: string | undefined;
  if (cfgResult.ok) {
    const val = cfgResult.stdout.trim();
    if (val) model = val;
  }
  if (!model) {
    const settings = tryReadJson<Record<string, unknown>>(home(".claude", "settings.json"))
      ?? tryReadJson<Record<string, unknown>>(home(".claude.json"));
    const val = settings?.["model"];
    if (typeof val === "string" && val.length > 0) model = val;
  }

  // Config paths
  const configCandidates = [
    home(".claude", "settings.json"),
    home(".claude.json"),
  ];
  const instructionCandidates = [
    home(".claude", "CLAUDE.md"),
    cwd("CLAUDE.md"),
    cwd(".claude", "CLAUDE.md"),
    cwd("CLAUDE.local.md"),
    cwd(".claude", "settings.json"),
    cwd(".claude", "settings.local.json"),
  ];
  const mcpCandidates = [
    home(".claude.json"),
    cwd(".mcp.json"),
  ];

  // MCP servers
  const mcpConfigPaths = findExistingPaths(mcpCandidates);
  const mcpServers: string[] = [];
  for (const p of mcpConfigPaths) {
    const data = tryReadJson<Record<string, unknown>>(p);
    if (data && typeof data === "object") {
      const servers = (data as Record<string, unknown>)["mcpServers"];
      if (servers && typeof servers === "object") {
        mcpServers.push(...Object.keys(servers as object));
      }
    }
  }

  const CLAUDE_MODELS = [
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ];

  // Fetch live model list via CLI; fall back to static list
  const models = cliModels.length > 0 ? cliModels : CLAUDE_MODELS;

  // Resolve short alias (e.g. "sonnet") to full model ID from the models list
  if (model && !model.startsWith("claude-")) {
    const lc = model.toLowerCase();
    const matched = models.find((m) => m.toLowerCase().includes(lc));
    if (matched) model = matched;
  }

  return {
    tool: "claude",
    provider: "Anthropic Claude",
    version,
    available,
    auth,
    models,
    model,
    skills: ["coding", "bash", "file-edit", "mcp"],
    mcp: {
      supported: true,
      servers: [...new Set(mcpServers)],
      configPaths: mcpConfigPaths,
    },
    capabilities: {
      contextTokens: 200_000,
      streaming: true,
      toolCalls: true,
      vision: true,
    },
    config: {
      paths: findExistingPaths(configCandidates),
      instructionFiles: findExistingPaths(instructionCandidates),
    },
  };
}

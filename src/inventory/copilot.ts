import type { DetectOptions, ProviderEntry } from "./types.js";
import { copilotSkillRoots, withScannedSkills } from "./skills-scan.js";
import { run } from "../utils/exec.js";
import { cwd, findExistingPaths, tryReadJson, envPresent } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";
import { homedir } from "node:os";
import path from "node:path";

const COPILOT_MODELS = [
  "claude-sonnet-4.6",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "claude-opus-4.7",
  "claude-opus-4.6",
  "claude-opus-4.5",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5.4-mini",
  "gpt-5-mini",
  "gpt-4.1",
];

export interface CopilotPathContext {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  cwd: string;
}

export interface CopilotPathCandidates {
  settings: string;
  config: string[];
  instructions: string[];
  mcp: string[];
}

/** Pure: build Copilot config/instruction/MCP candidate paths for the given platform. */
export function copilotPathCandidates(ctx: CopilotPathContext): CopilotPathCandidates {
  const p = ctx.platform === "win32" ? path.win32 : path.posix;
  const copilotHome = ctx.env["COPILOT_HOME"] ?? p.join(ctx.homeDir, ".copilot");
  const settings = p.join(copilotHome, "settings.json");
  return {
    settings,
    config: [p.join(copilotHome, "config.json"), settings],
    instructions: [
      p.join(copilotHome, "copilot-instructions.md"),
      p.join(ctx.cwd, ".github", "copilot-instructions.md"),
      p.join(ctx.cwd, "AGENTS.md"),
      p.join(ctx.cwd, "CLAUDE.md"),
      p.join(ctx.cwd, "GEMINI.md"),
    ],
    mcp: [p.join(copilotHome, "mcp-config.json"), p.join(ctx.cwd, ".mcp.json")],
  };
}

async function listCopilotModels(): Promise<string[]> {
  const token = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  if (!token) return [];

  try {
    const res = await fetch("https://api.github.com/copilot/models", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { models?: { id: string }[] };
    return (data.models ?? []).map((m) => m.id).filter(Boolean);
  } catch {
    return [];
  }
}

export async function detectCopilot(opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("copilot", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? "")
    : undefined;

  // Auth check and model list in parallel
  const [auth, cliModels] = await Promise.all([
    envPresent("GH_TOKEN") || envPresent("GITHUB_TOKEN")
      ? Promise.resolve("ok" as ProviderEntry["auth"])
      : run("gh", ["auth", "status"]).then((r) => (r.ok ? "ok" : "missing") as ProviderEntry["auth"]),
    opts.quick ? Promise.resolve([]) : listCopilotModels(),
  ]);

  // Copilot home
  const candidates = copilotPathCandidates({
    platform: process.platform,
    env: process.env,
    homeDir: homedir(),
    cwd: process.cwd(),
  });
  const copilotSettings = tryReadJson<Record<string, unknown>>(candidates.settings);
  const model = typeof copilotSettings?.["model"] === "string"
    ? copilotSettings["model"]
    : "claude-sonnet-4.6";

  const configCandidates = candidates.config;
  const instructionCandidates = candidates.instructions;
  const mcpCandidates = candidates.mcp;

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

  // Instruction glob: .github/instructions/**/*.instructions.md
  const ghInstructionsDir = cwd(".github", "instructions");
  const extraInstructions: string[] = [];
  try {
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    if (readdirSync(ghInstructionsDir, { withFileTypes: true })) {
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".instructions.md")) extraInstructions.push(full);
        }
      };
      walk(ghInstructionsDir);
    }
  } catch {
    // directory doesn't exist — fine
  }

  const models = cliModels.length > 0 ? cliModels : COPILOT_MODELS;
  const scanned = withScannedSkills(copilotSkillRoots());

  return {
    tool: "copilot",
    provider: "GitHub Copilot",
    version,
    available,
    auth,
    model,
    models,
    ...scanned,
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
      instructionFiles: [
        ...findExistingPaths(instructionCandidates),
        ...extraInstructions,
      ],
    },
  };
}

/** Lightweight enrich: remote model list only. */
export async function fetchCopilotModelsForEntry(
  entry: ProviderEntry,
): Promise<Pick<ProviderEntry, "models">> {
  const cliModels = await listCopilotModels();
  const models = cliModels.length > 0 ? cliModels : (entry.models?.length ? entry.models : COPILOT_MODELS);
  return { models };
}

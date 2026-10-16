import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AuthStatus, DetectOptions, ProviderEntry } from "./types.js";
import { geminiSkillRoots, withScannedSkills } from "./skills-scan.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, tryReadJson } from "../utils/config.js";
import { parseCliVersionLine } from "../utils/version.js";
import { collectMcpServersFromJsonFiles } from "./mcp-helpers.js";

const GEMINI_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
];

/** Read `selectedAuthType` from Gemini settings (nested `security.auth` or legacy top-level). */
export function readGeminiSelectedAuthType(
  settings: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!settings) return undefined;
  const security = settings["security"];
  if (security && typeof security === "object") {
    const auth = (security as Record<string, unknown>)["auth"];
    if (auth && typeof auth === "object") {
      const nested = (auth as Record<string, unknown>)["selectedAuthType"];
      if (typeof nested === "string" && nested.length > 0) return nested;
    }
  }
  const legacy = settings["selectedAuthType"];
  return typeof legacy === "string" && legacy.length > 0 ? legacy : undefined;
}

/**
 * Resolve Gemini CLI auth status. OAuth ("Login with Google") is detected by
 * the presence of a non-empty `oauth_creds.json` in the Gemini home — the file
 * is never opened, so no token material is read.
 */
export function detectGeminiAuth(opts: {
  geminiDir: string;
  selectedAuthType?: string;
  env?: NodeJS.ProcessEnv;
}): AuthStatus {
  const env = opts.env ?? process.env;
  if (env["GEMINI_API_KEY"] || env["GOOGLE_API_KEY"]) return "ok";

  const oauthCreds = join(opts.geminiDir, "oauth_creds.json");
  let hasOauthCreds = false;
  try {
    hasOauthCreds = existsSync(oauthCreds) && statSync(oauthCreds).size > 0;
  } catch {
    hasOauthCreds = false;
  }

  switch (opts.selectedAuthType) {
    case "oauth-personal":
      return hasOauthCreds ? "ok" : "missing";
    case "gemini-api-key":
      return "missing";
    case "vertex-ai":
      return env["GOOGLE_CLOUD_PROJECT"] && env["GOOGLE_CLOUD_LOCATION"] ? "ok" : "missing";
    case "cloud-shell":
      return "unknown";
    default:
      return hasOauthCreds ? "ok" : "missing";
  }
}

export async function detectGemini(_opts: DetectOptions = {}): Promise<ProviderEntry> {
  const versionResult = await run("gemini", ["--version"], 5_000);
  const available = versionResult.ok;
  const version = available
    ? parseCliVersionLine(versionResult.stdout.split("\n")[0] ?? "")
    : undefined;

  const userSettings = home(".gemini", "settings.json");
  const projectSettings = cwd(".gemini", "settings.json");
  const configCandidates = [userSettings, projectSettings];
  const instructionCandidates = [
    cwd("GEMINI.md"),
    cwd("AGENTS.md"),
    home(".gemini", "GEMINI.md"),
  ];
  const mcpCandidates = [userSettings, projectSettings];

  const { servers: mcpServers, configPaths: mcpConfigPaths } = collectMcpServersFromJsonFiles(
    mcpCandidates,
    "mcpServers",
  );

  const projectSettingsData = tryReadJson<Record<string, unknown>>(projectSettings);
  const userSettingsData = tryReadJson<Record<string, unknown>>(userSettings);
  const settings = projectSettingsData ?? userSettingsData;

  const auth = detectGeminiAuth({
    geminiDir: home(".gemini"),
    selectedAuthType:
      readGeminiSelectedAuthType(projectSettingsData) ?? readGeminiSelectedAuthType(userSettingsData),
  });
  const modelFromConfig =
    typeof settings?.["model"] === "string" && settings["model"].length > 0
      ? settings["model"]
      : undefined;
  const model = available
    ? (modelFromConfig ?? "gemini-2.5-pro")
    : modelFromConfig;

  const scanned = withScannedSkills(geminiSkillRoots());

  return {
    tool: "gemini",
    provider: "Google Gemini",
    version,
    available,
    auth,
    model,
    models: available ? GEMINI_MODELS : [],
    ...scanned,
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

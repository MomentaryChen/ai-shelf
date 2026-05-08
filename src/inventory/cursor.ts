import type { ProviderEntry } from "./types.js";
import { run } from "../utils/exec.js";
import { home, cwd, findExistingPaths, tryReadJson } from "../utils/config.js";
import { join } from "node:path";

export async function detectCursor(): Promise<ProviderEntry> {
  // Probe all candidate commands in parallel; pick the first that responds
  const probes = await Promise.all(
    ["agent"].map((cmd) =>
      run(cmd, ["--version"], 5_000).then((r) => ({ cmd, ...r }))
    )
  );
  const found = probes.find((r) => r.ok);
  const available = !!found;
  const version = found ? found.stdout.split("\n")[0] : undefined;
  const toolCmd = found?.cmd ?? "cursor";

  // Cursor config paths (Windows)
  const appData = process.env["APPDATA"] ?? home("AppData", "Roaming");
  const configCandidates = [
    home(".cursor", "mcp.json"),
    join(appData, "Cursor", "User", "settings.json"),
  ];
  const instructionCandidates = [
    cwd(".cursorrules"),
    cwd("AGENTS.md"),
  ];
  const mcpCandidates = [
    home(".cursor", "mcp.json"),
    cwd(".cursor", "mcp.json"),
  ];

  // Cursor rules (.cursor/rules/**/*.mdc)
  const cursorRulesDir = cwd(".cursor", "rules");
  const ruleFiles: string[] = [];
  try {
    const { readdirSync } = await import("node:fs");
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".mdc")) ruleFiles.push(full);
      }
    };
    walk(cursorRulesDir);
  } catch {
    // directory doesn't exist
  }

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

  const CURSOR_MODELS = [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "o1",
    "o1-mini",
    "o3-mini",
    "gemini-1.5-pro-latest",
    "gemini-2.0-flash",
    "cursor-small",
  ];

  // Model switching not supported; always use "auto"
  const model = "auto";

  // Fetch live model list: API first, then CLI, then static fallback
  let models: string[] = [];

  try {
    const apiKey = process.env["CURSOR_API_KEY"];
    const res = await fetch("https://api.cursor.com/v1/models", {
      headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json() as { data?: { id: string }[] };
      models = (data.data ?? []).map((m) => m.id).filter(Boolean);
    }
  } catch { /* fall through */ }

  if (models.length === 0 && available) {
    const listResult = await run(toolCmd, ["--list-models"]);
    if (listResult.ok) {
      models = listResult.stdout
        .split("\n")
        .map((line) => line.split(" - ")[0].trim())
        .filter((id) => id.length > 0 && id !== "Available models" && !id.startsWith("Tip:"));
    }
  }

  if (models.length === 0) models = CURSOR_MODELS;

  // Ensure the current model is always present in the list (e.g. "auto")
  if (!models.includes(model)) models = [model, ...models];

  return {
    tool: toolCmd,
    provider: "Cursor",
    version,
    available,
    auth: available ? "ok" : "unknown",
    models,
    model,
    skills: ["coding", "file-edit", "mcp"],
    mcp: {
      supported: true,
      servers: [...new Set(mcpServers)],
      configPaths: mcpConfigPaths,
    },
    capabilities: {
      contextTokens: 200_000,
      streaming: true,
      toolCalls: true,
    },
    config: {
      paths: findExistingPaths(configCandidates),
      instructionFiles: [
        ...findExistingPaths(instructionCandidates),
        ...ruleFiles,
      ],
    },
  };
}

import type { DetectOptions, ProviderEntry } from "./types.js";
import { detectClaude, fetchClaudeModelsForEntry } from "./claude.js";
import { detectCopilot, fetchCopilotModelsForEntry } from "./copilot.js";
import { detectCursor, fetchCursorModelsForEntry } from "./cursor.js";
import { detectCodex } from "./codex.js";
import { detectGemini } from "./gemini.js";
import { detectAider } from "./aider.js";
import { detectOpenCode } from "./opencode.js";
import { sortProviderEntries } from "../tool-sort.js";

const DETECTORS = [
  detectClaude,
  detectCopilot,
  detectCursor,
  detectCodex,
  detectGemini,
  detectAider,
  detectOpenCode,
] as const;

const DETECT_BY_TOOL: Record<string, (opts?: DetectOptions) => Promise<ProviderEntry>> = {
  claude: detectClaude,
  copilot: detectCopilot,
  agent: detectCursor,
  cursor: detectCursor,
  codex: detectCodex,
  gemini: detectGemini,
  aider: detectAider,
  opencode: detectOpenCode,
};

/** Detect a single tool by id (for per-tool IPC without running detectAll). */
export async function detectTool(
  tool: string,
  opts: DetectOptions = {},
): Promise<ProviderEntry | null> {
  const detect = DETECT_BY_TOOL[tool];
  if (!detect) return null;
  return detect(opts);
}

export async function detectAll(opts: DetectOptions = {}): Promise<ProviderEntry[]> {
  const results = await Promise.allSettled(
    DETECTORS.map((detect) => detect(opts)),
  );

  return sortProviderEntries(
    results
      .filter((r): r is PromiseFulfilledResult<ProviderEntry> => r.status === "fulfilled")
      .map((r) => r.value),
  );
}

const ENRICH_MODELS_BY_TOOL: Record<
  string,
  (entry: ProviderEntry) => Promise<Partial<Pick<ProviderEntry, "models" | "model">>>
> = {
  claude: fetchClaudeModelsForEntry,
  copilot: fetchCopilotModelsForEntry,
  agent: fetchCursorModelsForEntry,
  cursor: fetchCursorModelsForEntry,
};

export function shouldEnrichModels(entry: ProviderEntry): boolean {
  switch (entry.tool) {
    case "claude":
      return !!process.env["ANTHROPIC_API_KEY"];
    case "copilot":
      return !!(process.env["GH_TOKEN"] || process.env["GITHUB_TOKEN"]);
    case "agent":
    case "cursor":
      return !!process.env["CURSOR_API_KEY"] || entry.available;
    default:
      return false;
  }
}

/** Re-fetch remote model lists only (after quick detect; no version/auth/fs rescan). */
export async function enrichEntryModels(entry: ProviderEntry): Promise<ProviderEntry> {
  if (!shouldEnrichModels(entry)) return entry;
  const enrich = ENRICH_MODELS_BY_TOOL[entry.tool];
  if (!enrich) return entry;
  const patch = await enrich(entry);
  return { ...entry, ...patch };
}

export { DETECTORS };

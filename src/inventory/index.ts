import type { ProviderEntry } from "./types.js";
import { detectClaude } from "./claude.js";
import { detectCopilot } from "./copilot.js";
import { detectCursor } from "./cursor.js";

export async function detectAll(): Promise<ProviderEntry[]> {
  const results = await Promise.allSettled([
    detectClaude(),
    detectCopilot(),
    detectCursor(),
  ]);

  return results
    .filter((r): r is PromiseFulfilledResult<ProviderEntry> => r.status === "fulfilled")
    .map((r) => r.value);
}

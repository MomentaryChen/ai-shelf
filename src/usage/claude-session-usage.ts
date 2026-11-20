/**
 * Token / cost totals from Claude Code transcript lines (`<session>.jsonl`).
 * Pure (no fs / Electron): the main process feeds it text read incrementally.
 *
 * Assistant lines carry `message.usage` and `message.model`. Claude Code writes
 * one line per content block of a response, each repeating that response's
 * usage, so lines are de-duplicated by `message.id` (falling back to
 * `requestId`); a later line for the same response replaces the earlier one.
 */
import type { AgentSessionUsage } from "../shared/agent-session-usage.js";
import { claudeMessageCostUsd, type ClaudeMessageUsage } from "./claude-pricing.js";

interface UsageEntry extends ClaudeMessageUsage {
  model: string;
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function usageEntry(model: string, u: Record<string, unknown>, fast: boolean): UsageEntry {
  const cacheWrite = count(u.cache_creation_input_tokens);
  const ttl =
    u.cache_creation && typeof u.cache_creation === "object"
      ? (u.cache_creation as Record<string, unknown>)
      : null;
  const write1h = ttl ? Math.min(count(ttl.ephemeral_1h_input_tokens), cacheWrite) : 0;
  return {
    model,
    inputTokens: count(u.input_tokens),
    outputTokens: count(u.output_tokens),
    cacheReadTokens: count(u.cache_read_input_tokens),
    cacheWrite5mTokens: cacheWrite - write1h,
    cacheWrite1hTokens: write1h,
    fast,
  };
}

/**
 * Billed usage entries of an assistant line (empty for other lines).
 *
 * Top-level `usage` covers the response's own model. Server-side sub-calls
 * on another model (e.g. the advisor tool, `usage.iterations[]` entries of
 * type `advisor_message` with their own `model`) are billed on top of it and
 * are returned as extra entries keyed `<id>#<index>`.
 */
export function parseClaudeUsageLine(line: string): { key: string; entry: UsageEntry }[] {
  // Cheap pre-filter: most lines (user turns, tool results) have no usage.
  if (!line.includes('"usage"')) return [];
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return [];
  }
  if (!row || typeof row !== "object") return [];
  const r = row as { type?: unknown; requestId?: unknown; message?: unknown };
  if (r.type !== "assistant" || !r.message || typeof r.message !== "object") return [];
  const msg = r.message as { id?: unknown; model?: unknown; usage?: unknown };
  const model = typeof msg.model === "string" ? msg.model : "";
  // `<synthetic>` marks locally generated messages (errors, interrupts) — no API call.
  if (!model || model.startsWith("<")) return [];
  if (!msg.usage || typeof msg.usage !== "object") return [];
  const key =
    typeof msg.id === "string" && msg.id
      ? msg.id
      : typeof r.requestId === "string" && r.requestId
        ? r.requestId
        : null;
  if (!key) return [];

  const u = msg.usage as Record<string, unknown>;
  const fast = u.speed === "fast";
  const out = [{ key, entry: usageEntry(model, u, fast) }];
  if (Array.isArray(u.iterations)) {
    u.iterations.forEach((it: unknown, i) => {
      if (!it || typeof it !== "object") return;
      const iter = it as Record<string, unknown>;
      if (iter.type === "message" || typeof iter.model !== "string" || !iter.model) return;
      out.push({ key: `${key}#${String(i)}`, entry: usageEntry(iter.model, iter, fast) });
    });
  }
  return out;
}

/**
 * Byte length of the complete lines at the start of `buf` (through the last
 * `\n`). A transcript may be mid-write; the tail is read again next time.
 * Splitting on the byte keeps multi-byte UTF-8 characters intact.
 */
export function completeLinesLength(buf: Uint8Array): number {
  const i = buf.lastIndexOf(0x0a);
  return i < 0 ? 0 : i + 1;
}

export interface ClaudeUsageAccumulator {
  /** Feed complete lines (text may hold many, separated by `\n`). */
  addText(text: string): void;
  summary(): AgentSessionUsage;
}

export function createClaudeUsageAccumulator(): ClaudeUsageAccumulator {
  // Map order = first-seen order; re-set on update moves nothing, so track recency separately.
  const entries = new Map<string, UsageEntry>();
  const modelLastSeen = new Map<string, number>();
  let seq = 0;
  let cached: AgentSessionUsage | null = null;

  return {
    addText(text) {
      for (const line of text.split("\n")) {
        for (const { key, entry } of parseClaudeUsageLine(line.trim())) {
          entries.set(key, entry);
          modelLastSeen.set(entry.model, ++seq);
          cached = null;
        }
      }
    },
    summary() {
      if (cached) return cached;
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheWriteTokens = 0;
      let cost = 0;
      let priced = 0;
      for (const e of entries.values()) {
        inputTokens += e.inputTokens;
        outputTokens += e.outputTokens;
        cacheReadTokens += e.cacheReadTokens;
        cacheWriteTokens += e.cacheWrite5mTokens + e.cacheWrite1hTokens;
        const c = claudeMessageCostUsd(e.model, e);
        if (c != null) {
          cost += c;
          priced += 1;
        }
      }
      cached = {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
        costUsd: priced > 0 ? cost : null,
        costComplete: priced === entries.size,
        models: [...modelLastSeen.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m),
        messages: entries.size,
      };
      return cached;
    },
  };
}

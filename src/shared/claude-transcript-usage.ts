/**
 * Token usage, estimated cost and conversation text from a Claude Code transcript
 * (`<config>/projects/<encoded cwd>/<sessionId>.jsonl`). Pure — the caller reads the file.
 *
 * Claude Code writes one line per content block, and every line of one API response repeats
 * the same `message.id` and `usage`, so usage is counted once per message id (last line wins).
 */
import type { TaskRunMessage, TaskRunUsage } from "./task-run-types.js";

/** USD per million tokens. Cache writes are billed at 1.25× input (5-minute TTL). */
interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

/**
 * List prices, matched by model-id prefix (longest first). Older models at the end.
 * Source: Anthropic pricing as of 2026-11; unknown models get no cost estimate.
 */
const PRICES: ReadonlyArray<[prefix: string, price: ModelPrice]> = [
  ["claude-fable-5-2", { input: 8, output: 40, cacheRead: 0.2 }],
  ["claude-mythos-5-2", { input: 8, output: 40, cacheRead: 0.2 }],
  ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-mythos-5-1", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-fable-5", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-mythos-5", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2 }],
  ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-8", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-7", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-6", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-5", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4", { input: 15, output: 75, cacheRead: 1.5 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheRead: 0.1 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
  ["claude-sonnet-4", { input: 3, output: 15, cacheRead: 0.3 }],
  ["claude-3-7-sonnet", { input: 3, output: 15, cacheRead: 0.3 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  ["claude-haiku-4-5", { input: 1, output: 5, cacheRead: 0.1 }],
  ["claude-3-5-haiku", { input: 0.8, output: 4, cacheRead: 0.08 }],
];

const CACHE_WRITE_MULTIPLIER = 1.25;

export function claudeModelPrice(model: string | undefined): ModelPrice | null {
  if (!model) return null;
  // Bedrock / Vertex ids: `anthropic.claude-…`, `claude-…@date`; drop the prefix.
  const id = model.toLowerCase().replace(/^.*?(claude-)/, "$1");
  for (const [prefix, price] of PRICES) {
    if (id === prefix || id.startsWith(`${prefix}-`) || id.startsWith(`${prefix}@`)) return price;
  }
  return null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

interface MessageUsage {
  model?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function parseLines(jsonl: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const v: unknown = JSON.parse(line);
      if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as Record<string, unknown>);
    } catch {
      /* a line cut off mid-write */
    }
  }
  return out;
}

/** Usage summed over the transcript's assistant messages; null when there are none. */
export function summarizeClaudeTranscriptUsage(jsonl: string): TaskRunUsage | null {
  const byId = new Map<string, MessageUsage>();
  let anon = 0;
  let lastModel: string | undefined;
  for (const entry of parseLines(jsonl)) {
    if (entry.type !== "assistant") continue;
    const message = entry.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (!message || !usage) continue;
    const model = typeof message.model === "string" ? message.model : undefined;
    // Claude Code writes `<synthetic>` messages (errors, interrupts) with zero usage.
    if (model === "<synthetic>") continue;
    const id = typeof message.id === "string" ? message.id : `anon-${anon++}`;
    byId.set(id, {
      model,
      input: num(usage.input_tokens),
      output: num(usage.output_tokens),
      cacheRead: num(usage.cache_read_input_tokens),
      cacheWrite: num(usage.cache_creation_input_tokens),
    });
    if (model) lastModel = model;
  }
  if (byId.size === 0) return null;

  const total: TaskRunUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    messages: byId.size,
    ...(lastModel ? { model: lastModel } : {}),
  };
  let cost = 0;
  let priced = true;
  for (const u of byId.values()) {
    total.inputTokens += u.input;
    total.outputTokens += u.output;
    total.cacheReadTokens += u.cacheRead;
    total.cacheWriteTokens += u.cacheWrite;
    const price = claudeModelPrice(u.model);
    if (!price) {
      if (u.input + u.output + u.cacheRead + u.cacheWrite > 0) priced = false;
      continue;
    }
    cost +=
      (u.input * price.input +
        u.output * price.output +
        u.cacheRead * price.cacheRead +
        u.cacheWrite * price.input * CACHE_WRITE_MULTIPLIER) /
      1_000_000;
  }
  if (priced) total.costUsd = Math.round(cost * 1_000_000) / 1_000_000;
  return total;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block && typeof block === "object" && (block as { type?: unknown }).type === "text"
        ? String((block as { text?: unknown }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The visible conversation: user prompts and assistant text, in order. Tool calls, tool
 * results, thinking and side-chain (sub-agent) lines are skipped; consecutive assistant
 * text blocks of one message are joined.
 */
export function extractClaudeConversation(jsonl: string, maxMessages = 500): TaskRunMessage[] {
  const out: TaskRunMessage[] = [];
  let lastAssistantId: string | undefined;
  for (const entry of parseLines(jsonl)) {
    if (entry.isSidechain === true || entry.isMeta === true) continue;
    const role = entry.type;
    if (role !== "user" && role !== "assistant") continue;
    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const text = textOf(message.content).trim();
    if (!text) continue;
    // Slash-command plumbing and local command output Claude Code stores as user lines.
    if (role === "user" && /^<(command-|local-command-|system-reminder)/.test(text)) continue;
    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : undefined;
    const id = typeof message.id === "string" ? message.id : undefined;
    const prev = out[out.length - 1];
    if (role === "assistant" && prev?.role === "assistant" && id && id === lastAssistantId) {
      prev.text = `${prev.text}\n\n${text}`;
      continue;
    }
    out.push({ role, text, ...(timestamp ? { timestamp } : {}) });
    lastAssistantId = role === "assistant" ? id : undefined;
    if (out.length >= maxMessages) break;
  }
  return out;
}

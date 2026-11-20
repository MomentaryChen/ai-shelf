/**
 * Claude API list prices, used to estimate what an agent session cost.
 * Pure (no fs / Electron) so it can be unit-tested and shared.
 *
 * Prices differ by generation within a family (Opus 5.5 is not priced like
 * Opus 5), so rows are keyed by family + version. A model without a row gets
 * no price — callers then show tokens only rather than a guessed figure.
 * Source: Anthropic API pricing as of 2026-11 (Anthropic first-party rates;
 * Bedrock / Vertex bill differently).
 */

export type ClaudeFamily = "fable" | "mythos" | "opus" | "sonnet" | "haiku";

/** USD per million tokens. */
export interface ClaudeRates {
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute cache write (1.25x input). */
  cacheWrite5m: number;
  /** 1-hour cache write (2x input). */
  cacheWrite1h: number;
}

interface ClaudePriceRow {
  input: number;
  output: number;
  /** Cache read price when it is not the usual 0.1x input. */
  cacheRead?: number;
  /** Higher-priced tier for long prompts (prompt tokens above `aboveTokens`). */
  longPrompt?: { aboveTokens: number; input: number; output: number };
}

const PRICES: Record<string, ClaudePriceRow> = {
  "fable-5.2": { input: 8, output: 40, cacheRead: 0.2 },
  "fable-5.1": { input: 10, output: 50, cacheRead: 0.25 },
  "fable-5": { input: 10, output: 50 },
  "mythos-5.2": { input: 8, output: 40, cacheRead: 0.2 },
  "mythos-5.1": { input: 10, output: 50, cacheRead: 0.25 },
  "opus-5.5": { input: 4, output: 20, cacheRead: 0.2 },
  "opus-5": { input: 5, output: 25 },
  "opus-4.8": { input: 5, output: 25 },
  "opus-4.7": { input: 5, output: 25 },
  "opus-4.6": { input: 5, output: 25 },
  "sonnet-5.5": { input: 2, output: 10, cacheRead: 0.1 },
  "sonnet-5": { input: 2, output: 10 },
  "sonnet-4.6": { input: 3, output: 15 },
  "haiku-5.5": {
    input: 0.1,
    output: 0.5,
    longPrompt: { aboveTokens: 100_000, input: 0.5, output: 2.5 },
  },
  "haiku-4.5": { input: 1, output: 5 },
};

/** Fast mode bills every token at 2x the standard rate. */
const FAST_MODE_MULTIPLIER = 2;

const MODEL_RE = /claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?!\d)/;

/**
 * `{ family, version }` for a Claude model id, tolerant of date suffixes,
 * provider prefixes (`us.anthropic.`) and `[1m]`-style tags. Null when the id
 * is not a Claude model.
 */
export function parseClaudeModel(model: string): { family: ClaudeFamily; version: string } | null {
  const m = MODEL_RE.exec(model.toLowerCase());
  if (!m) return null;
  const [, family, major, minor] = m;
  return { family: family as ClaudeFamily, version: minor ? `${major}.${minor}` : major };
}

function rowFor(model: string): ClaudePriceRow | null {
  const parsed = parseClaudeModel(model);
  if (!parsed) return null;
  return PRICES[`${parsed.family}-${parsed.version}`] ?? null;
}

function ratesFrom(input: number, output: number, cacheRead: number): ClaudeRates {
  return { input, output, cacheRead, cacheWrite5m: input * 1.25, cacheWrite1h: input * 2 };
}

/**
 * Per-million-token rates for `model`, or null when its price is unknown.
 * `promptTokens` (input + cache read + cache write of one request) selects a
 * long-prompt tier where the model has one.
 */
export function claudeRates(model: string, promptTokens = 0): ClaudeRates | null {
  const row = rowFor(model);
  if (!row) return null;
  const cacheRead = row.cacheRead ?? row.input * 0.1;
  const tier = row.longPrompt;
  if (tier && promptTokens > tier.aboveTokens) {
    // Long-prompt tier: scale the cache rates with the input price.
    const scale = tier.input / row.input;
    return ratesFrom(tier.input, tier.output, cacheRead * scale);
  }
  return ratesFrom(row.input, row.output, cacheRead);
}

export interface ClaudeMessageUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** 5-minute cache writes (also used when the transcript has no TTL breakdown). */
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  fast?: boolean;
}

/** Estimated USD for one API response, or null when the model's price is unknown. */
export function claudeMessageCostUsd(model: string, usage: ClaudeMessageUsage): number | null {
  const prompt =
    usage.inputTokens + usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens;
  const rates = claudeRates(model, prompt);
  if (!rates) return null;
  const perMillion =
    usage.inputTokens * rates.input +
    usage.outputTokens * rates.output +
    usage.cacheReadTokens * rates.cacheRead +
    usage.cacheWrite5mTokens * rates.cacheWrite5m +
    usage.cacheWrite1hTokens * rates.cacheWrite1h;
  return (perMillion / 1_000_000) * (usage.fast ? FAST_MODE_MULTIPLIER : 1);
}

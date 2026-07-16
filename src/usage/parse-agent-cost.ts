/** Extract cost / token totals from agent CLI stdout/stderr when present. */

export type ParsedAgentCost = {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
};

function asFinite(n: unknown): number | undefined {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : undefined;
}

function mergeParsed(into: ParsedAgentCost, next: ParsedAgentCost): void {
  if (into.costUsd == null && next.costUsd != null) into.costUsd = next.costUsd;
  if (into.inputTokens == null && next.inputTokens != null) into.inputTokens = next.inputTokens;
  if (into.outputTokens == null && next.outputTokens != null) into.outputTokens = next.outputTokens;
}

function fromObject(obj: Record<string, unknown>): ParsedAgentCost {
  const usage =
    obj.usage && typeof obj.usage === "object" ? (obj.usage as Record<string, unknown>) : undefined;
  const costUsd =
    asFinite(obj.total_cost_usd) ??
    asFinite(obj.totalCostUsd) ??
    asFinite(obj.cost_usd) ??
    asFinite(obj.costUsd);
  const inputTokens =
    asFinite(usage?.input_tokens) ??
    asFinite(usage?.inputTokens) ??
    asFinite(obj.input_tokens) ??
    asFinite(obj.inputTokens);
  const outputTokens =
    asFinite(usage?.output_tokens) ??
    asFinite(usage?.outputTokens) ??
    asFinite(obj.output_tokens) ??
    asFinite(obj.outputTokens);
  return { costUsd, inputTokens, outputTokens };
}

function tryParseJsonBlob(text: string): ParsedAgentCost | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const parsed = fromObject(obj);
    if (parsed.costUsd != null || parsed.inputTokens != null || parsed.outputTokens != null) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Best-effort parse of Claude / Cursor agent print-mode cost fields.
 * Looks for JSON result objects and plain "Total cost: $x.xx" lines.
 */
export function parseAgentCostFromText(...texts: string[]): ParsedAgentCost {
  const result: ParsedAgentCost = {};
  const combined = texts.filter(Boolean).join("\n");
  if (!combined.trim()) return result;

  for (const line of combined.split(/\r?\n/)) {
    const fromLine = tryParseJsonBlob(line);
    if (fromLine) mergeParsed(result, fromLine);
  }

  // Whole-buffer JSON (single-line or pretty-printed result).
  const whole = tryParseJsonBlob(combined);
  if (whole) mergeParsed(result, whole);

  if (result.costUsd == null) {
    const costMatch = combined.match(
      /total\s*cost(?:\s*usd)?\s*[:=]?\s*\$?\s*([\d]+(?:\.\d+)?)/i,
    );
    if (costMatch) {
      const n = Number(costMatch[1]);
      if (Number.isFinite(n)) result.costUsd = n;
    }
  }

  return result;
}

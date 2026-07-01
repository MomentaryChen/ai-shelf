/** Short aliases accepted by `claude --model`. */
export const CLAUDE_MODEL_SHORT_PRESETS = ["opus", "sonnet", "haiku"] as const;

export type ClaudeModelShortPreset = (typeof CLAUDE_MODEL_SHORT_PRESETS)[number];

const MODEL_FLAG_RE = /--model(?:=(\S+)|\s+(\S+))/;

export function parseClaudeModelFromToolArgs(toolArgs: string): {
  model: string;
  extraArgs: string;
} {
  const trimmed = toolArgs.trim();
  if (!trimmed) return { model: "", extraArgs: "" };

  const match = trimmed.match(MODEL_FLAG_RE);
  if (!match) return { model: "", extraArgs: trimmed };

  const raw = (match[1] ?? match[2] ?? "").replace(/^["']|["']$/g, "");
  const extraArgs = trimmed
    .replace(MODEL_FLAG_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { model: raw, extraArgs };
}

export function buildToolArgsWithClaudeModel(model: string, extraArgs: string): string {
  const parts: string[] = [];
  const m = model.trim();
  if (m) parts.push(`--model ${m}`);
  const extra = extraArgs.trim();
  if (extra) parts.push(extra);
  return parts.join(" ");
}

export function claudeModelMatchesPreset(model: string, preset: ClaudeModelShortPreset): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return false;
  if (m === preset) return true;
  return m.includes(preset);
}

export function mergeClaudeModelOptions(detectedModels: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...CLAUDE_MODEL_SHORT_PRESETS, ...(detectedModels ?? [])]) {
    const key = id.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

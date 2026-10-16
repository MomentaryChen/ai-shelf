import { CronExpressionParser } from "cron-parser";
import { canonicalToolId } from "../tools.js";
import { normalizeFlowClaudeToolArgs } from "./claude-tool-args.js";
import { flowTimezone, validateFlowCronMinInterval } from "./flow-cron.js";
import { parseFlowDocument, splitFlowDocument } from "./flow-parse.js";
import type { FlowDesktopNotifyMode, FlowWebhookDef } from "./flow-types.js";
import { formatFlowValidationIssues, validateFlowDefinition } from "./flow-validate.js";

function formatYamlScalar(value: string): string {
  if (/[:#\s'"*|]/.test(value) || value === "") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function upsertTopLevelField(lines: string[], key: string, value: string | undefined): string[] {
  const keyRe = new RegExp(`^${key}:\\s*`);
  const filtered = lines.filter((line) => !keyRe.test(line));
  if (value === undefined || value.trim() === "") return filtered;

  const insertAfter = filtered.findIndex((line) => /^enabled:/.test(line));
  const insertIdx = insertAfter >= 0 ? insertAfter + 1 : filtered.findIndex((line) => /^id:/.test(line)) + 1;
  const next = [...filtered];
  next.splice(Math.max(insertIdx, 0), 0, `${key}: ${formatYamlScalar(value.trim())}`);
  return next;
}

/** Remove a top-level key and its indented child lines (`env:` map, `webhooks:` list…). */
function removeTopLevelBlock(lines: string[], key: string): string[] {
  const keyRe = new RegExp(`^${key}:`);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (keyRe.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && (/^\s/.test(line) || line.trim() === "")) continue;
    skipping = false;
    out.push(line);
  }
  return out;
}

/** Replace a top-level block; `block` is the full set of lines (key line first). Inserted before `phases:`. */
function upsertTopLevelBlock(lines: string[], key: string, block: string[] | undefined): string[] {
  const filtered = removeTopLevelBlock(lines, key);
  if (!block || block.length === 0) return filtered;
  const phasesIdx = filtered.findIndex((line) => /^phases:/.test(line));
  const insertIdx = phasesIdx >= 0 ? phasesIdx : filtered.length;
  const next = [...filtered];
  next.splice(insertIdx, 0, ...block);
  return next;
}

function formatEnvBlock(env: Record<string, string> | null | undefined): string[] | undefined {
  const entries = Object.entries(env ?? {});
  if (entries.length === 0) return undefined;
  return ["env:", ...entries.map(([k, v]) => `  ${k}: ${formatYamlScalar(v)}`)];
}

/** Webhook payloads are JSON-ish; always single-quote them so `{}` / `:` survive. */
function formatSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatWebhooksBlock(hooks: FlowWebhookDef[] | null | undefined): string[] | undefined {
  if (!hooks || hooks.length === 0) return undefined;
  const lines = ["webhooks:"];
  for (const hook of hooks) {
    lines.push(`  - url: ${formatYamlScalar(hook.url)}`);
    if (hook.method && hook.method !== "POST") lines.push(`    method: ${hook.method}`);
    const on = hook.on.length === 2 || hook.on.length === 0 ? "both" : hook.on[0]!;
    lines.push(`    on: ${on}`);
    if (hook.contentType?.trim()) lines.push(`    content_type: ${formatYamlScalar(hook.contentType.trim())}`);
    if (hook.authorization?.trim()) {
      lines.push(`    authorization: ${formatYamlScalar(hook.authorization.trim())}`);
    }
    if (hook.payload?.trim()) lines.push(`    payload: ${formatSingleQuoted(hook.payload.replace(/\r?\n/g, " "))}`);
  }
  return lines;
}

export function validateFlowCron(expression: string, timezone?: string): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return "Cron expression is required";
  const tz = flowTimezone(timezone);
  try {
    CronExpressionParser.parse(trimmed, { tz });
  } catch (err: unknown) {
    return err instanceof Error ? err.message : "Invalid cron expression";
  }
  return validateFlowCronMinInterval(trimmed, tz);
}

/** Ensure claude runner defaults (`tool_args: --model haiku`) and validate schedule before save. */
export function ensureFlowDefaultsInContent(content: string): { content: string } | { error: string } {
  const parsed = parseFlowDocument(content, "draft.flow.md", "");
  if ("error" in parsed) return { error: parsed.error };

  let next = content;

  if (parsed.runner === "claude" && canonicalToolId(parsed.agentTool) === "claude") {
    const toolArgs = normalizeFlowClaudeToolArgs("claude", parsed.toolArgs ?? "");
    const patched = patchFlowRunnerInContent(next, { toolArgs });
    if ("error" in patched) return patched;
    next = patched.content;
  }

  if (parsed.schedule?.trim()) {
    const cronError = validateFlowCron(parsed.schedule, parsed.timezone);
    if (cronError) return { error: cronError };
  }

  const issues = validateFlowDefinition(parsed);
  if (issues.length > 0) return { error: formatFlowValidationIssues(issues) };

  return { content: next };
}

export type FlowSchedulePatch = {
  schedule: string | null;
  timezone?: string | null;
};

export type FlowRunnerPatch = {
  tool?: string | null;
  toolArgs?: string | null;
  cwd?: string | null;
  profile?: string | null;
  /** `undefined` leaves `env:` untouched; `null` / `{}` removes it. */
  env?: Record<string, string> | null;
};

export type FlowNotifyPatch = {
  notify?: FlowDesktopNotifyMode;
  onSuccess?: "slack" | "none";
  onFail?: "slack" | "none";
  webhooks?: FlowWebhookDef[] | null;
  historyMaxRuns?: number | null;
  historyMaxDays?: number | null;
};

export function patchFlowNotifyInContent(
  content: string,
  patch: FlowNotifyPatch,
): { content: string } | { error: string } {
  const split = splitFlowDocument(content);
  if (!split) return { error: "Missing YAML frontmatter" };

  let fmLines = split.frontmatter.split(/\r?\n/);
  if (patch.notify !== undefined) {
    fmLines = upsertTopLevelField(fmLines, "notify", patch.notify === "all" ? undefined : patch.notify);
  }
  if (patch.onSuccess !== undefined) {
    fmLines = upsertTopLevelField(fmLines, "on_success", patch.onSuccess === "slack" ? "slack" : undefined);
  }
  if (patch.onFail !== undefined) {
    fmLines = upsertTopLevelField(fmLines, "on_fail", patch.onFail === "slack" ? "slack" : undefined);
  }
  if (patch.historyMaxRuns !== undefined) {
    const v = patch.historyMaxRuns;
    fmLines = upsertTopLevelField(fmLines, "history_max_runs", v && v > 0 ? String(Math.floor(v)) : undefined);
  }
  if (patch.historyMaxDays !== undefined) {
    const v = patch.historyMaxDays;
    fmLines = upsertTopLevelField(fmLines, "history_max_days", v && v > 0 ? String(Math.floor(v)) : undefined);
  }
  if (patch.webhooks !== undefined) {
    fmLines = upsertTopLevelBlock(fmLines, "webhooks", formatWebhooksBlock(patch.webhooks));
  }

  const body = split.body.length > 0 ? `${split.body}\n` : "";
  return {
    content: `---\n${fmLines.join("\n")}\n---\n\n${body}`,
  };
}

export function patchFlowRunnerInContent(
  content: string,
  patch: FlowRunnerPatch,
): { content: string } | { error: string } {
  const split = splitFlowDocument(content);
  if (!split) return { error: "Missing YAML frontmatter" };

  let fmLines = split.frontmatter.split(/\r?\n/);

  const tool = patch.tool?.trim();
  fmLines = upsertTopLevelField(fmLines, "tool", tool || undefined);

  const toolArgs = patch.toolArgs?.trim();
  fmLines = upsertTopLevelField(fmLines, "tool_args", toolArgs || undefined);

  const cwd = patch.cwd?.trim();
  fmLines = upsertTopLevelField(fmLines, "cwd", cwd || undefined);

  const profile = patch.profile?.trim();
  fmLines = upsertTopLevelField(fmLines, "profile", profile || undefined);

  if (patch.env !== undefined) {
    fmLines = upsertTopLevelBlock(fmLines, "env", formatEnvBlock(patch.env));
  }

  const body = split.body.length > 0 ? `${split.body}\n` : "";
  return {
    content: `---\n${fmLines.join("\n")}\n---\n\n${body}`,
  };
}

export function patchFlowScheduleInContent(
  content: string,
  patch: FlowSchedulePatch,
): { content: string } | { error: string } {
  const split = splitFlowDocument(content);
  if (!split) return { error: "Missing YAML frontmatter" };

  const schedule = patch.schedule?.trim() ?? "";
  if (schedule) {
    const cronError = validateFlowCron(schedule, patch.timezone ?? undefined);
    if (cronError) return { error: cronError };
  }

  let fmLines = split.frontmatter.split(/\r?\n/);
  if (schedule) {
    fmLines = upsertTopLevelField(fmLines, "schedule", schedule);
    const tz = patch.timezone?.trim();
    fmLines = upsertTopLevelField(fmLines, "timezone", tz || undefined);
  } else {
    fmLines = upsertTopLevelField(fmLines, "schedule", undefined);
    fmLines = upsertTopLevelField(fmLines, "timezone", undefined);
  }

  const body = split.body.length > 0 ? `${split.body}\n` : "";
  return {
    content: `---\n${fmLines.join("\n")}\n---\n\n${body}`,
  };
}

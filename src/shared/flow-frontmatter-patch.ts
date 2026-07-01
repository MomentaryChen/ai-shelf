import { CronExpressionParser } from "cron-parser";
import { flowTimezone } from "./flow-cron.js";
import { splitFlowDocument } from "./flow-parse.js";

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

export function validateFlowCron(expression: string, timezone?: string): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return "Cron expression is required";
  try {
    CronExpressionParser.parse(trimmed, { tz: flowTimezone(timezone) });
    return null;
  } catch (err: unknown) {
    return err instanceof Error ? err.message : "Invalid cron expression";
  }
}

export type FlowSchedulePatch = {
  schedule: string | null;
  timezone?: string | null;
};

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

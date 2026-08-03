/** Pure cron helpers for the Tools → Cron panel. */
import { CronExpressionParser } from "cron-parser";

export type CronFieldId = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek";

export type CronPresetId =
  | "everyHour"
  | "everyDay9"
  | "weekdays9"
  | "weeklyMon9"
  | "every15min"
  | "every30min"
  | "noon"
  | "midnight"
  | "firstOfMonth"
  | "friday17";

export type CronPreset = {
  id: CronPresetId;
  cron: string;
};

export type CronFieldParts = Record<CronFieldId, string>;

export type CronPreviewResult =
  | { ok: true; nextRuns: Date[]; parts: CronFieldParts }
  | { ok: false; error: string };

export const CRON_FIELD_ORDER: CronFieldId[] = [
  "minute",
  "hour",
  "dayOfMonth",
  "month",
  "dayOfWeek",
];

/** Compact field cheat-sheet (standard 5-field cron). */
export const CRON_FIELD_RANGES: Record<CronFieldId, string> = {
  minute: "0–59",
  hour: "0–23",
  dayOfMonth: "1–31",
  month: "1–12",
  dayOfWeek: "0–7 (0 & 7 = Sun)",
};

export const CRON_PRESETS: CronPreset[] = [
  { id: "every15min", cron: "*/15 * * * *" },
  { id: "every30min", cron: "*/30 * * * *" },
  { id: "everyHour", cron: "0 * * * *" },
  { id: "everyDay9", cron: "0 9 * * *" },
  { id: "weekdays9", cron: "0 9 * * 1-5" },
  { id: "weeklyMon9", cron: "0 9 * * 1" },
  { id: "noon", cron: "0 12 * * *" },
  { id: "midnight", cron: "0 0 * * *" },
  { id: "firstOfMonth", cron: "0 9 1 * *" },
  { id: "friday17", cron: "0 17 * * 5" },
];

export const COMMON_CRON_TIMEZONES = [
  "UTC",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Split a 5-field cron into named parts; returns null when shape is wrong. */
export function parseCronParts(expression: string): CronFieldParts | null {
  const fields = expression.trim().split(/\s+/u).filter(Boolean);
  if (fields.length !== 5) return null;
  return {
    minute: fields[0]!,
    hour: fields[1]!,
    dayOfMonth: fields[2]!,
    month: fields[3]!,
    dayOfWeek: fields[4]!,
  };
}

export function validateCronExpression(
  expression: string,
  timezone: string,
): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return "empty";
  if (!parseCronParts(trimmed)) return "fields";
  try {
    CronExpressionParser.parse(trimmed, {
      tz: timezone.trim() || "UTC",
      currentDate: new Date(),
    });
    return null;
  } catch {
    return "invalid";
  }
}

/** Next `count` fire times, or a structured error. */
export function previewCron(
  expression: string,
  timezone: string,
  count = 8,
  from = new Date(),
): CronPreviewResult {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  const parts = parseCronParts(trimmed);
  if (!parts) return { ok: false, error: "fields" };

  const tz = timezone.trim() || "UTC";
  try {
    // Validate timezone early — cron-parser may throw a less clear error.
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    return { ok: false, error: "timezone" };
  }

  try {
    const iter = CronExpressionParser.parse(trimmed, {
      tz,
      currentDate: from,
    });
    const nextRuns: Date[] = [];
    for (let i = 0; i < count; i++) {
      nextRuns.push(iter.next().toDate());
    }
    return { ok: true, nextRuns, parts };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

export function formatCronRun(date: Date, timeZone: string, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timeZone.trim() || "UTC",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "shortOffset",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

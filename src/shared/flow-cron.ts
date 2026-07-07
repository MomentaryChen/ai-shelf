import { CronExpressionParser } from "cron-parser";

const DEFAULT_TIMEZONE = "Asia/Taipei";

/** Minimum gap between consecutive cron fires (reject `* * * * *` etc.). */
export const FLOW_CRON_MIN_INTERVAL_MS = 60 * 60 * 1000;

export function flowTimezone(tz?: string): string {
  const trimmed = tz?.trim();
  return trimmed || DEFAULT_TIMEZONE;
}

/** Start/end of the local calendar minute containing `date`. */
function localMinuteBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setSeconds(0, 0);
  start.setMilliseconds(0);
  const end = new Date(start.getTime() + 59_999);
  return { start, end };
}

/**
 * Previous cron fire for the minute containing `date`.
 * Uses the minute end as `currentDate` so `prev()` includes a fire at :00.000
 * (cron-parser excludes the current instant from `prev()`).
 */
function cronPrevInMinute(expression: string, timezone: string, date: Date): Date | null {
  try {
    const { end } = localMinuteBounds(date);
    const iter = CronExpressionParser.parse(expression, {
      tz: flowTimezone(timezone),
      currentDate: end,
    });
    return iter.prev().toDate();
  } catch {
    return null;
  }
}

/** Minute-precision slot id for idempotent scheduled runs. */
export function cronSlotKey(expression: string, timezone: string, date = new Date()): string | null {
  const prev = cronPrevInMinute(expression, timezone, date);
  if (!prev) return null;
  const iso = prev.toISOString();
  return iso ? iso.slice(0, 16) : null;
}

/** True when `date` falls on a cron tick (same minute as prev fire). */
export function cronMatchesMinute(expression: string, timezone: string, date = new Date()): boolean {
  const prev = cronPrevInMinute(expression, timezone, date);
  if (!prev) return false;
  const { start, end } = localMinuteBounds(date);
  const t = prev.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function cronNextRun(expression: string, timezone: string, from = new Date()): string | null {
  try {
    const iter = CronExpressionParser.parse(expression, {
      tz: flowTimezone(timezone),
      currentDate: from,
    });
    const next = iter.next();
    const iso = next.toISOString();
    return iso ?? null;
  } catch {
    return null;
  }
}

export function validateFlowCronMinInterval(
  expression: string,
  timezone: string,
  minMs = FLOW_CRON_MIN_INTERVAL_MS,
  from = new Date(),
): string | null {
  try {
    const iter = CronExpressionParser.parse(expression, {
      tz: flowTimezone(timezone),
      currentDate: from,
    });
    const first = iter.next();
    const second = iter.next();
    const gapMs = second.getTime() - first.getTime();
    if (gapMs < minMs) {
      const gapMin = Math.max(1, Math.round(gapMs / 60_000));
      const minHours = minMs / 3_600_000;
      return `Schedule fires every ${gapMin} minute(s); minimum interval is ${minHours} hour(s)`;
    }
    return null;
  } catch {
    return null;
  }
}

export function shouldRunFlowNow(
  expression: string,
  timezone: string,
  lastSlot: string | null | undefined,
  now = new Date(),
): { due: boolean; slotKey: string | null } {
  if (!cronMatchesMinute(expression, timezone, now)) {
    return { due: false, slotKey: null };
  }
  const slotKey = cronSlotKey(expression, timezone, now);
  if (!slotKey || slotKey === lastSlot) {
    return { due: false, slotKey };
  }
  return { due: true, slotKey };
}

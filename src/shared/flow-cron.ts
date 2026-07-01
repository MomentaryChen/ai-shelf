import { CronExpressionParser } from "cron-parser";

const DEFAULT_TIMEZONE = "Asia/Taipei";

/** Minimum gap between consecutive cron fires (reject `* * * * *` etc.). */
export const FLOW_CRON_MIN_INTERVAL_MS = 60 * 60 * 1000;

export function flowTimezone(tz?: string): string {
  const trimmed = tz?.trim();
  return trimmed || DEFAULT_TIMEZONE;
}

/** Minute-precision slot id for idempotent scheduled runs. */
export function cronSlotKey(expression: string, timezone: string, date = new Date()): string | null {
  try {
    const iter = CronExpressionParser.parse(expression, {
      tz: flowTimezone(timezone),
      currentDate: date,
    });
    const prev = iter.prev();
    const iso = prev.toISOString();
    return iso ? iso.slice(0, 16) : null;
  } catch {
    return null;
  }
}

/** True when `date` falls on a cron tick (same minute as prev fire). */
export function cronMatchesMinute(expression: string, timezone: string, date = new Date()): boolean {
  try {
    const tz = flowTimezone(timezone);
    const minuteStart = new Date(date);
    minuteStart.setSeconds(0, 0);
    minuteStart.setMilliseconds(0);
    const minuteEnd = new Date(minuteStart.getTime() + 59_999);

    const iter = CronExpressionParser.parse(expression, {
      tz,
      currentDate: minuteStart,
      endDate: minuteEnd,
    });
    iter.next();
    return true;
  } catch {
    return false;
  }
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

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

/** Stable anchor (Monday) for min-interval scans — must not depend on validation time. */
const CRON_MIN_INTERVAL_SCAN_ANCHOR = new Date("2024-01-01T00:00:00.000Z");

/** Cover weekday-only patterns, full month DOM, and one seasonal cycle. */
const CRON_MIN_INTERVAL_SCAN_MS = 366 * 24 * 60 * 60 * 1000;

const CRON_MIN_INTERVAL_SCAN_MAX_FIRES = 10_000;

function minConsecutiveCronGapMs(
  expression: string,
  timezone: string,
  anchor: Date,
  scanMs: number,
  maxFires: number,
  stopBelowMs?: number,
): number | null {
  const iter = CronExpressionParser.parse(expression, {
    tz: flowTimezone(timezone),
    currentDate: anchor,
  });
  let prev = iter.next().toDate();
  let minGapMs = Number.POSITIVE_INFINITY;
  const endMs = anchor.getTime() + scanMs;

  for (let i = 1; i < maxFires && prev.getTime() < endMs; i++) {
    const next = iter.next().toDate();
    const gapMs = next.getTime() - prev.getTime();
    if (gapMs < minGapMs) {
      minGapMs = gapMs;
      if (stopBelowMs !== undefined && minGapMs < stopBelowMs) return minGapMs;
    }
    prev = next;
  }

  return Number.isFinite(minGapMs) ? minGapMs : null;
}

export function validateFlowCronMinInterval(
  expression: string,
  timezone: string,
  minMs = FLOW_CRON_MIN_INTERVAL_MS,
): string | null {
  try {
    const minGapMs = minConsecutiveCronGapMs(
      expression,
      timezone,
      CRON_MIN_INTERVAL_SCAN_ANCHOR,
      CRON_MIN_INTERVAL_SCAN_MS,
      CRON_MIN_INTERVAL_SCAN_MAX_FIRES,
      minMs,
    );
    if (minGapMs === null || minGapMs >= minMs) return null;

    const gapMin = Math.max(1, Math.round(minGapMs / 60_000));
    const minHours = minMs / 3_600_000;
    return `Schedule fires every ${gapMin} minute(s); minimum interval is ${minHours} hour(s)`;
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

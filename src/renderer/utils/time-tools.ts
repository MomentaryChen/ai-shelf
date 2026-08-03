/** Pure time helpers for the Tools → Time panel. */

export type TimeUnit = "s" | "ms" | "us" | "ns";

export type ParsedTime = {
  /** Epoch milliseconds (UTC). */
  epochMs: number;
  /** How the input was interpreted. */
  unit: TimeUnit | "iso" | "now";
  /** True when unit was inferred (not forced / not ISO / not now). */
  inferred: boolean;
};

export type TimeFormats = {
  unixSeconds: string;
  unixMillis: string;
  unixMicros: string;
  unixNanos: string;
  isoUtc: string;
  isoLocal: string;
  rfc2822: string;
  /** Calendar date in the given IANA zone, e.g. 2024-04-05. */
  zoneDate: string;
  /** Clock time in the given IANA zone, e.g. 20:34:56.789. */
  zoneTime: string;
  /** Full formatted stamp in the given IANA zone. */
  zoneFull: string;
  /** Offset label for that instant in the zone, e.g. GMT+8 / UTC. */
  zoneOffset: string;
  /** Relative to `nowMs`, e.g. "3h 12m ago". */
  relative: string;
};

const UNIT_SUFFIX_RE =
  /^(?<num>[+-]?(?:\d+(?:[._]\d+)*|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*(?<unit>s|sec|secs|second|seconds|ms|msec|millis|millisecond|milliseconds|us|µs|μs|usec|micros|microsecond|microseconds|ns|nsec|nanos|nanosecond|nanoseconds)?$/iu;

const PURE_INT_RE = /^[+-]?\d+$/u;

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

function normalizeNumberToken(raw: string): string {
  return raw.replace(/_/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
}

/** Infer unix unit from magnitude (absolute value). */
export function inferUnixUnit(absValue: number): TimeUnit {
  if (!Number.isFinite(absValue)) return "ms";
  // ~ year 2001–2286 in seconds sits near 1e9–1e10
  if (absValue < 1e11) return "s";
  // ms through ~ year 5138
  if (absValue < 1e14) return "ms";
  // microseconds
  if (absValue < 1e17) return "us";
  return "ns";
}

function unitFromSuffix(suffix: string | undefined): TimeUnit | null {
  if (!suffix) return null;
  const s = suffix.toLowerCase();
  if (s === "s" || s.startsWith("sec")) return "s";
  if (s === "ms" || s.startsWith("msec") || s.startsWith("milli")) return "ms";
  if (
    s === "us" ||
    s === "µs" ||
    s === "μs" ||
    s.startsWith("usec") ||
    s.startsWith("micro")
  ) {
    return "us";
  }
  if (s === "ns" || s.startsWith("nsec") || s.startsWith("nano")) return "ns";
  return null;
}

export function epochMsFromUnix(value: number, unit: TimeUnit): number {
  switch (unit) {
    case "s":
      return value * 1000;
    case "ms":
      return value;
    case "us":
      return value / 1000;
    case "ns":
      return value / 1_000_000;
  }
}

function isValidDate(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) < 8.64e15; // Date-safe range
}

/**
 * Parse a debug-friendly time input.
 * @param forcedUnit When set, numeric input is treated as that unit (ignores suffix/inference).
 */
export function parseTimeInput(
  raw: string,
  opts: { nowMs?: number; forcedUnit?: TimeUnit | "auto" } = {},
): ParsedTime | null {
  const input = raw.trim();
  if (!input) return null;

  const nowMs = opts.nowMs ?? Date.now();
  const forced = opts.forcedUnit && opts.forcedUnit !== "auto" ? opts.forcedUnit : null;

  if (/^now$/iu.test(input)) {
    return { epochMs: nowMs, unit: "now", inferred: false };
  }

  const suffixMatch = UNIT_SUFFIX_RE.exec(input);
  if (suffixMatch?.groups?.num) {
    const numToken = normalizeNumberToken(suffixMatch.groups.num);
    const value = Number(numToken);
    if (!Number.isFinite(value)) return null;

    const suffixUnit = unitFromSuffix(suffixMatch.groups.unit);
    if (forced || suffixUnit) {
      const unit = forced ?? suffixUnit!;
      const epochMs = epochMsFromUnix(value, unit);
      if (!isValidDate(epochMs)) return null;
      return { epochMs, unit, inferred: false };
    }

    // Bare number — only treat as unix when it looks integer-like (or scientific).
    if (PURE_INT_RE.test(numToken) || /[eE]/u.test(numToken)) {
      const unit = inferUnixUnit(Math.abs(value));
      const epochMs = epochMsFromUnix(value, unit);
      if (!isValidDate(epochMs)) return null;
      return { epochMs, unit, inferred: true };
    }
  }

  // ISO / locale date strings — require a letter or date separators so bare floats
  // that failed the unix path don't accidentally become years.
  if (/[a-z]/iu.test(input) || /[-/:T]/.test(input)) {
    const ms = Date.parse(input);
    if (isValidDate(ms)) {
      return { epochMs: ms, unit: "iso", inferred: false };
    }
  }

  return null;
}

function pad(n: number, width = 2): string {
  return String(Math.trunc(Math.abs(n))).padStart(width, "0");
}

/** Local ISO-like with numeric offset, e.g. 2024-04-05T20:34:56.789+08:00 */
export function formatIsoLocal(epochMs: number): string {
  const d = new Date(epochMs);
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}${sign}${oh}:${om}`
  );
}

export function formatRelative(epochMs: number, nowMs: number): string {
  const delta = epochMs - nowMs;
  const abs = Math.abs(delta);
  const suffix = delta <= 0 ? "ago" : "from now";

  if (abs < 1000) return delta <= 0 ? "just now" : "in <1s";

  const units: { label: string; ms: number }[] = [
    { label: "d", ms: 86_400_000 },
    { label: "h", ms: 3_600_000 },
    { label: "m", ms: 60_000 },
    { label: "s", ms: 1000 },
  ];

  const parts: string[] = [];
  let rest = abs;
  for (const u of units) {
    if (parts.length >= 2) break;
    const n = Math.floor(rest / u.ms);
    if (n > 0 || (parts.length > 0 && u.label === "s")) {
      if (n > 0) {
        parts.push(`${n}${u.label}`);
        rest -= n * u.ms;
      }
    }
  }
  if (parts.length === 0) parts.push("0s");
  return `${parts.join(" ")} ${suffix}`;
}

function formatInZone(
  epochMs: number,
  timeZone: string,
): Pick<TimeFormats, "zoneDate" | "zoneTime" | "zoneFull" | "zoneOffset"> {
  try {
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(epochMs);
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      fractionalSecondDigits: 3,
    }).formatToParts(epochMs);
    const offsetParts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(epochMs);

    const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";

    const zoneDate = `${get(dateParts, "year")}-${get(dateParts, "month")}-${get(dateParts, "day")}`;
    const frac = get(timeParts, "fractionalSecond");
    const zoneTime =
      `${get(timeParts, "hour")}:${get(timeParts, "minute")}:${get(timeParts, "second")}` +
      (frac ? `.${frac}` : "");
    const zoneOffset = get(offsetParts, "timeZoneName") || "UTC";
    const zoneFull = `${zoneDate} ${zoneTime} ${zoneOffset}`;
    return { zoneDate, zoneTime, zoneFull, zoneOffset };
  } catch {
    return {
      zoneDate: "—",
      zoneTime: "—",
      zoneFull: "—",
      zoneOffset: "—",
    };
  }
}

export function formatTimeFormats(
  epochMs: number,
  opts: { timeZone: string; nowMs?: number } ,
): TimeFormats {
  const nowMs = opts.nowMs ?? Date.now();
  const d = new Date(epochMs);
  const sec = Math.trunc(epochMs / 1000);
  const ms = Math.trunc(epochMs);
  // Keep integer strings; for sub-ms inputs we still surface floored micros/nanos from ms.
  const micros = Math.trunc(epochMs * 1000);
  const nanos = Math.trunc(epochMs * 1_000_000);
  const zone = formatInZone(epochMs, opts.timeZone);

  return {
    unixSeconds: String(sec),
    unixMillis: String(ms),
    unixMicros: String(micros),
    unixNanos: String(nanos),
    isoUtc: d.toISOString(),
    isoLocal: formatIsoLocal(epochMs),
    rfc2822: d.toUTCString(),
    ...zone,
    relative: formatRelative(epochMs, nowMs),
  };
}

/** System IANA zone when available, else UTC. */
export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

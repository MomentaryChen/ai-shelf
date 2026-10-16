/**
 * Pure (side-effect free) mapping of AI Shelf schedules onto OS schedulers:
 * Windows Task Scheduler (`schtasks`), macOS launchd (LaunchAgent plist) and
 * Linux systemd user timers (.service + .timer).
 *
 * Schedule model:
 * - `interval` — run every N minutes (what the "Run when app is closed" job uses: 1 minute;
 *   per-flow cron is then evaluated by `ai-shelf flow due`).
 * - `cron` — classic 5-field cron (`min hour dom month dow`), same syntax flows use.
 *
 * Unsupported combinations (mapping returns `{ ok: false, error }`):
 * - Windows: `cron` schedules (schtasks has no cron equivalent); intervals outside 1–1439 minutes.
 * - launchd: a cron `timezone` (launchd always uses the system time zone); cron expressions that
 *   expand to more than {@link LAUNCHD_MAX_CALENDAR_ENTRIES} calendar dicts.
 * - systemd: none for valid 5-field cron. Restricted day-of-month AND day-of-week (cron ORs them,
 *   `OnCalendar=` ANDs them) is emitted as two `OnCalendar=` lines, which systemd unions.
 * - All: 6-field (seconds) cron, `?`, `L`, `W`, `#` and `@reboot`-style macros.
 */

export type OsSchedule =
  | { kind: "interval"; minutes: number }
  | { kind: "cron"; expression: string; timezone?: string };

export type MapResult<T> = ({ ok: true } & T) | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Cron parsing
// ---------------------------------------------------------------------------

/** Expanded cron fields; `null` means the field is `*` (unrestricted). */
export type CronFields = {
  minute: number[] | null;
  hour: number[] | null;
  dayOfMonth: number[] | null;
  month: number[] | null;
  /** 0 = Sunday … 6 = Saturday (7 is folded into 0). */
  dayOfWeek: number[] | null;
};

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const DOW_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const CRON_MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

type FieldSpec = { name: string; min: number; max: number; names?: string[]; namesBase?: number };

const FIELD_SPECS: FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTH_NAMES, namesBase: 1 },
  { name: "day-of-week", min: 0, max: 7, names: DOW_NAMES, namesBase: 0 },
];

function parseCronValue(raw: string, spec: FieldSpec): number {
  const lower = raw.toLowerCase();
  if (spec.names) {
    const idx = spec.names.indexOf(lower);
    if (idx >= 0) return idx + (spec.namesBase ?? 0);
  }
  if (!/^\d+$/u.test(raw)) throw new Error(`Unsupported ${spec.name} value "${raw}"`);
  const n = Number(raw);
  if (n < spec.min || n > spec.max) {
    throw new Error(
      `${spec.name} value ${raw} out of range ${String(spec.min)}-${String(spec.max)}`,
    );
  }
  return n;
}

function parseCronField(field: string, spec: FieldSpec): number[] | null {
  if (field === "*") return null;
  const isDow = spec.name === "day-of-week";
  const fullMax = isDow ? 6 : spec.max;
  const values = new Set<number>();
  for (const part of field.split(",")) {
    if (!part) throw new Error(`Empty list item in ${spec.name} field`);
    const slash = part.split("/");
    if (slash.length > 2) throw new Error(`Invalid step in ${spec.name} field "${part}"`);
    const rangePart = slash[0] ?? "";
    const stepPart = slash.length === 2 ? (slash[1] ?? "") : null;
    let step = 1;
    if (stepPart !== null) {
      if (!/^\d+$/u.test(stepPart) || Number(stepPart) === 0) {
        throw new Error(`Invalid step in ${spec.name} field "${part}"`);
      }
      step = Number(stepPart);
    }
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = spec.min;
      hi = fullMax;
    } else if (rangePart.includes("-")) {
      const bounds = rangePart.split("-");
      if (bounds.length !== 2) throw new Error(`Invalid range in ${spec.name} field "${part}"`);
      lo = parseCronValue(bounds[0] ?? "", spec);
      hi = parseCronValue(bounds[1] ?? "", spec);
      if (lo > hi) throw new Error(`Invalid range in ${spec.name} field "${part}"`);
    } else {
      lo = parseCronValue(rangePart, spec);
      hi = stepPart !== null ? fullMax : lo;
    }
    for (let v = lo; v <= hi; v += step) values.add(isDow && v === 7 ? 0 : v);
  }
  return [...values].sort((x, y) => x - y);
}

/** Parse a 5-field cron expression into explicit value lists. Throws on unsupported syntax. */
export function parseCronFields(expression: string): CronFields {
  const trimmed = expression.trim();
  const expanded = CRON_MACROS[trimmed.toLowerCase()] ?? trimmed;
  if (expanded.startsWith("@")) throw new Error(`Unsupported cron macro "${trimmed}"`);
  const parts = expanded.split(/\s+/u);
  if (parts.length !== 5) {
    throw new Error(`Expected 5 cron fields (min hour dom month dow), got ${String(parts.length)}`);
  }
  const parsed = FIELD_SPECS.map((spec, i) => parseCronField(parts[i] ?? "", spec));
  const dayOfWeek = parsed[4] ?? null;
  return {
    minute: parsed[0] ?? null,
    hour: parsed[1] ?? null,
    dayOfMonth: parsed[2] ?? null,
    month: parsed[3] ?? null,
    dayOfWeek: dayOfWeek && dayOfWeek.length === 7 ? null : dayOfWeek,
  };
}

function validateInterval(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < 1)
    return `Interval must be a whole number of minutes >= 1 (got ${String(minutes)})`;
  return null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Windows Task Scheduler
// ---------------------------------------------------------------------------

/** `schtasks /Create` arguments. Only `interval` (1–1439 min) is supported. */
export function buildSchtasksCreateArgs(
  taskName: string,
  taskRun: string,
  schedule: OsSchedule,
): MapResult<{ args: string[] }> {
  if (schedule.kind !== "interval") {
    return {
      ok: false,
      error: "Windows Task Scheduler backend supports interval schedules only (not cron)",
    };
  }
  const bad = validateInterval(schedule.minutes);
  if (bad) return { ok: false, error: bad };
  if (schedule.minutes > 1439) {
    return { ok: false, error: "schtasks /SC MINUTE supports at most 1439 minutes" };
  }
  return {
    ok: true,
    args: [
      "/Create",
      "/TN",
      taskName,
      "/TR",
      taskRun,
      "/SC",
      "MINUTE",
      "/MO",
      String(schedule.minutes),
      "/F",
    ],
  };
}

// ---------------------------------------------------------------------------
// macOS launchd
// ---------------------------------------------------------------------------

export const LAUNCHD_MAX_CALENDAR_ENTRIES = 500;

export type LaunchdCalendarEntry = Partial<
  Record<"Minute" | "Hour" | "Day" | "Month" | "Weekday", number>
>;

export type LaunchdTiming =
  | { startInterval: number; startCalendarInterval?: undefined }
  | { startInterval?: undefined; startCalendarInterval: LaunchdCalendarEntry[] };

function cartesian(
  axes: Array<{ key: keyof LaunchdCalendarEntry; values: number[] | null }>,
): LaunchdCalendarEntry[] {
  let out: LaunchdCalendarEntry[] = [{}];
  for (const { key, values } of axes) {
    if (!values) continue;
    const next: LaunchdCalendarEntry[] = [];
    for (const entry of out) for (const v of values) next.push({ ...entry, [key]: v });
    out = next;
    if (out.length > LAUNCHD_MAX_CALENDAR_ENTRIES) break;
  }
  return out;
}

/**
 * Map a schedule onto launchd keys.
 * - Intervals that divide an hour (1, 2, 3, 5, …, 60 min) become wall-clock aligned
 *   `StartCalendarInterval` entries, one per minute value (explicit rather than an empty
 *   wildcard dict), so minute-slot checks never skip a minute.
 * - Other intervals become `StartInterval` (seconds since load, not clock-aligned).
 * - Cron becomes the cartesian product of its restricted fields. launchd ORs `Day` and `Weekday`
 *   when both are present in one dict, matching cron semantics.
 */
export function mapScheduleToLaunchd(schedule: OsSchedule): MapResult<LaunchdTiming> {
  if (schedule.kind === "interval") {
    const bad = validateInterval(schedule.minutes);
    if (bad) return { ok: false, error: bad };
    const m = schedule.minutes;
    if (m < 60 && 60 % m === 0) {
      const entries: LaunchdCalendarEntry[] = [];
      for (let minute = 0; minute < 60; minute += m) entries.push({ Minute: minute });
      return { ok: true, startCalendarInterval: entries };
    }
    if (m === 60) return { ok: true, startCalendarInterval: [{ Minute: 0 }] };
    return { ok: true, startInterval: m * 60 };
  }

  if (schedule.timezone?.trim()) {
    return {
      ok: false,
      error: `launchd cannot run a schedule in time zone "${schedule.timezone}"; it always uses the system time zone`,
    };
  }
  let fields: CronFields;
  try {
    fields = parseCronFields(schedule.expression);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  const entries = cartesian([
    { key: "Month", values: fields.month },
    { key: "Day", values: fields.dayOfMonth },
    { key: "Weekday", values: fields.dayOfWeek },
    { key: "Hour", values: fields.hour },
    { key: "Minute", values: fields.minute },
  ]);
  if (entries.length > LAUNCHD_MAX_CALENDAR_ENTRIES) {
    return {
      ok: false,
      error: `Cron "${schedule.expression}" expands to more than ${String(LAUNCHD_MAX_CALENDAR_ENTRIES)} launchd calendar entries`,
    };
  }
  return { ok: true, startCalendarInterval: entries };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type LaunchdPlistOptions = {
  label: string;
  programArguments: string[];
  schedule: OsSchedule;
  workingDirectory?: string;
  environment?: Record<string, string>;
  standardOutPath?: string;
  standardErrorPath?: string;
};

const LAUNCHD_KEY_ORDER: Array<keyof LaunchdCalendarEntry> = [
  "Month",
  "Day",
  "Weekday",
  "Hour",
  "Minute",
];

function plistCalendarDict(entry: LaunchdCalendarEntry, indent: string): string[] {
  const keys = LAUNCHD_KEY_ORDER.filter((k) => entry[k] !== undefined);
  if (keys.length === 0) return [`${indent}<dict/>`];
  return [
    `${indent}<dict>`,
    ...keys.flatMap((k) => [
      `${indent}  <key>${k}</key>`,
      `${indent}  <integer>${String(entry[k])}</integer>`,
    ]),
    `${indent}</dict>`,
  ];
}

/** Full LaunchAgent plist XML for `~/Library/LaunchAgents/<label>.plist`. */
export function buildLaunchdPlist(opts: LaunchdPlistOptions): MapResult<{ plist: string }> {
  const timing = mapScheduleToLaunchd(opts.schedule);
  if (!timing.ok) return timing;

  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${xmlEscape(opts.label)}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...opts.programArguments.map((a) => `    <string>${xmlEscape(a)}</string>`),
    `  </array>`,
  ];
  if (opts.workingDirectory) {
    lines.push(
      `  <key>WorkingDirectory</key>`,
      `  <string>${xmlEscape(opts.workingDirectory)}</string>`,
    );
  }
  const env = Object.entries(opts.environment ?? {});
  if (env.length > 0) {
    lines.push(`  <key>EnvironmentVariables</key>`, `  <dict>`);
    for (const [k, v] of env)
      lines.push(`    <key>${xmlEscape(k)}</key>`, `    <string>${xmlEscape(v)}</string>`);
    lines.push(`  </dict>`);
  }
  if (timing.startInterval !== undefined) {
    lines.push(
      `  <key>StartInterval</key>`,
      `  <integer>${String(timing.startInterval)}</integer>`,
    );
  } else {
    lines.push(`  <key>StartCalendarInterval</key>`);
    const entries = timing.startCalendarInterval;
    if (entries.length === 1) {
      lines.push(...plistCalendarDict(entries[0], "  "));
    } else {
      lines.push(
        `  <array>`,
        ...entries.flatMap((e) => plistCalendarDict(e, "    ")),
        `  </array>`,
      );
    }
  }
  lines.push(`  <key>RunAtLoad</key>`, `  <false/>`);
  if (opts.standardOutPath) {
    lines.push(
      `  <key>StandardOutPath</key>`,
      `  <string>${xmlEscape(opts.standardOutPath)}</string>`,
    );
  }
  if (opts.standardErrorPath) {
    lines.push(
      `  <key>StandardErrorPath</key>`,
      `  <string>${xmlEscape(opts.standardErrorPath)}</string>`,
    );
  }
  lines.push(`</dict>`, `</plist>`, ``);
  return { ok: true, plist: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Linux systemd user timers
// ---------------------------------------------------------------------------

export type SystemdTiming = {
  /** `OnCalendar=` values (each line is unioned by systemd). */
  onCalendar: string[];
  /** Monotonic timers for intervals that do not divide an hour. */
  onActiveSec?: string;
  onUnitActiveSec?: string;
};

const SYSTEMD_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function systemdList(values: number[] | null, pad = false): string {
  if (!values) return "*";
  return values.map((v) => (pad ? String(v).padStart(2, "0") : String(v))).join(",");
}

/**
 * Map a schedule onto systemd timer directives.
 * - Intervals dividing an hour → `OnCalendar=*-*-* *:00/N:00` (clock aligned, like cron).
 * - Other intervals → `OnActiveSec=` + `OnUnitActiveSec=` (monotonic; first run N min after enable).
 * - Cron → `OnCalendar=[DOW ]*-MM-DD HH:MM:00[ TZ]`; when both day-of-month and day-of-week are
 *   restricted, two lines are emitted so systemd ORs them like cron does.
 */
export function mapScheduleToSystemd(schedule: OsSchedule): MapResult<SystemdTiming> {
  if (schedule.kind === "interval") {
    const bad = validateInterval(schedule.minutes);
    if (bad) return { ok: false, error: bad };
    const m = schedule.minutes;
    if (m === 1) return { ok: true, onCalendar: ["*-*-* *:*:00"] };
    if (m < 60 && 60 % m === 0) return { ok: true, onCalendar: [`*-*-* *:00/${String(m)}:00`] };
    if (m === 60) return { ok: true, onCalendar: ["*-*-* *:00:00"] };
    return {
      ok: true,
      onCalendar: [],
      onActiveSec: `${String(m)}min`,
      onUnitActiveSec: `${String(m)}min`,
    };
  }

  let fields: CronFields;
  try {
    fields = parseCronFields(schedule.expression);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  const tz = schedule.timezone?.trim();
  if (tz && !/^[A-Za-z0-9_+\-/]+$/u.test(tz)) {
    return { ok: false, error: `Invalid time zone "${tz}"` };
  }
  const time = `${systemdList(fields.hour, true)}:${systemdList(fields.minute, true)}:00`;
  const month = systemdList(fields.month, true);
  const build = (dow: number[] | null, dom: number[] | null): string => {
    const dowPart = dow ? `${dow.map((d) => SYSTEMD_DOW[d]).join(",")} ` : "";
    return `${dowPart}*-${month}-${systemdList(dom, true)} ${time}${tz ? ` ${tz}` : ""}`;
  };
  const onCalendar =
    fields.dayOfMonth && fields.dayOfWeek
      ? [build(null, fields.dayOfMonth), build(fields.dayOfWeek, null)]
      : [build(fields.dayOfWeek, fields.dayOfMonth)];
  return { ok: true, onCalendar };
}

/** Quote one argument for systemd `ExecStart=` (also escapes `%` specifiers and `$` expansion). */
export function quoteSystemdArg(arg: string): string {
  const escaped = arg.replace(/%/g, "%%").replace(/\$/g, "$$$$");
  if (escaped !== "" && !/[\s"'\\;]/u.test(escaped)) return escaped;
  return `"${escaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type SystemdServiceOptions = {
  description: string;
  execStart: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
};

/** Contents of `~/.config/systemd/user/<name>.service` (oneshot, started by the timer). */
export function buildSystemdService(opts: SystemdServiceOptions): string {
  const lines = ["[Unit]", `Description=${opts.description}`, "", "[Service]", "Type=oneshot"];
  // WorkingDirectory= takes a raw path (no quoting); only specifiers need escaping.
  if (opts.workingDirectory)
    lines.push(`WorkingDirectory=${opts.workingDirectory.replace(/%/g, "%%")}`);
  for (const [k, v] of Object.entries(opts.environment ?? {})) {
    lines.push(`Environment=${quoteSystemdArg(`${k}=${v}`)}`);
  }
  lines.push(`ExecStart=${opts.execStart.map(quoteSystemdArg).join(" ")}`, "");
  return lines.join("\n");
}

export type SystemdTimerOptions = {
  description: string;
  /** Service unit the timer activates, e.g. `ai-shelf-flow-due.service`. */
  unit: string;
  schedule: OsSchedule;
};

/** Contents of `~/.config/systemd/user/<name>.timer`. */
export function buildSystemdTimer(opts: SystemdTimerOptions): MapResult<{ timer: string }> {
  const timing = mapScheduleToSystemd(opts.schedule);
  if (!timing.ok) return timing;
  const lines = ["[Unit]", `Description=${opts.description}`, "", "[Timer]"];
  for (const cal of timing.onCalendar) lines.push(`OnCalendar=${cal}`);
  if (timing.onActiveSec) lines.push(`OnActiveSec=${timing.onActiveSec}`);
  if (timing.onUnitActiveSec) lines.push(`OnUnitActiveSec=${timing.onUnitActiveSec}`);
  lines.push("AccuracySec=1s", `Unit=${opts.unit}`, "", "[Install]", "WantedBy=timers.target", "");
  return { ok: true, timer: lines.join("\n") };
}

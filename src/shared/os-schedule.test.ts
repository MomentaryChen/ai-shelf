import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLaunchdPlist,
  buildSchtasksCreateArgs,
  buildSystemdService,
  buildSystemdTimer,
  LAUNCHD_MAX_CALENDAR_ENTRIES,
  mapScheduleToLaunchd,
  mapScheduleToSystemd,
  parseCronFields,
  quoteSystemdArg,
} from "./os-schedule.js";

describe("parseCronFields", () => {
  it("expands lists, ranges, steps and names", () => {
    const f = parseCronFields("*/15 9-11 1,15 jan-mar mon-fri");
    assert.deepEqual(f.minute, [0, 15, 30, 45]);
    assert.deepEqual(f.hour, [9, 10, 11]);
    assert.deepEqual(f.dayOfMonth, [1, 15]);
    assert.deepEqual(f.month, [1, 2, 3]);
    assert.deepEqual(f.dayOfWeek, [1, 2, 3, 4, 5]);
  });

  it("treats * as unrestricted and folds Sunday 7 into 0", () => {
    const f = parseCronFields("0 * * * 7");
    assert.deepEqual(f.minute, [0]);
    assert.equal(f.hour, null);
    assert.equal(f.dayOfMonth, null);
    assert.deepEqual(f.dayOfWeek, [0]);
    assert.equal(parseCronFields("0 0 * * 0-7").dayOfWeek, null);
  });

  it("supports macros and rejects unsupported syntax", () => {
    assert.deepEqual(parseCronFields("@daily"), parseCronFields("0 0 * * *"));
    assert.throws(() => parseCronFields("0 0 * *"), /5 cron fields/);
    assert.throws(() => parseCronFields("0 0 0 * * *"), /5 cron fields/);
    assert.throws(() => parseCronFields("0 0 L * *"), /Unsupported/);
    assert.throws(() => parseCronFields("60 * * * *"), /out of range/);
    assert.throws(() => parseCronFields("@reboot"), /Unsupported cron macro/);
  });
});

describe("buildSchtasksCreateArgs", () => {
  it("keeps the existing every-minute task arguments", () => {
    const r = buildSchtasksCreateArgs("AI Shelf Flow Due", '"C:\\x\\run.cmd"', {
      kind: "interval",
      minutes: 1,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.args, [
        "/Create",
        "/TN",
        "AI Shelf Flow Due",
        "/TR",
        '"C:\\x\\run.cmd"',
        "/SC",
        "MINUTE",
        "/MO",
        "1",
        "/F",
      ]);
    }
  });

  it("rejects cron and out-of-range intervals", () => {
    assert.equal(
      buildSchtasksCreateArgs("t", "x", { kind: "cron", expression: "0 9 * * *" }).ok,
      false,
    );
    assert.equal(buildSchtasksCreateArgs("t", "x", { kind: "interval", minutes: 1440 }).ok, false);
    assert.equal(buildSchtasksCreateArgs("t", "x", { kind: "interval", minutes: 0 }).ok, false);
  });
});

describe("mapScheduleToLaunchd", () => {
  it("maps hour-dividing intervals to clock-aligned calendar entries", () => {
    const every1 = mapScheduleToLaunchd({ kind: "interval", minutes: 1 });
    assert.equal(every1.ok, true);
    if (every1.ok) {
      assert.equal(every1.startCalendarInterval?.length, 60);
      assert.deepEqual(every1.startCalendarInterval?.[59], { Minute: 59 });
    }
    const every15 = mapScheduleToLaunchd({ kind: "interval", minutes: 15 });
    assert.ok(every15.ok);
    if (every15.ok) {
      assert.deepEqual(every15.startCalendarInterval, [
        { Minute: 0 },
        { Minute: 15 },
        { Minute: 30 },
        { Minute: 45 },
      ]);
    }
    const hourly = mapScheduleToLaunchd({ kind: "interval", minutes: 60 });
    assert.ok(hourly.ok);
    if (hourly.ok) assert.deepEqual(hourly.startCalendarInterval, [{ Minute: 0 }]);
  });

  it("maps other intervals to StartInterval seconds", () => {
    const r = mapScheduleToLaunchd({ kind: "interval", minutes: 7 });
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.startInterval, 420);
  });

  it("maps cron to the cartesian product of restricted fields", () => {
    const r = mapScheduleToLaunchd({ kind: "cron", expression: "30 9,17 * * 1-5" });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.startCalendarInterval?.length, 10);
      assert.deepEqual(r.startCalendarInterval?.[0], { Weekday: 1, Hour: 9, Minute: 30 });
    }
  });

  it("rejects time zones and oversized expansions", () => {
    const tz = mapScheduleToLaunchd({
      kind: "cron",
      expression: "0 9 * * *",
      timezone: "Asia/Taipei",
    });
    assert.equal(tz.ok, false);
    const big = mapScheduleToLaunchd({ kind: "cron", expression: "*/2 */2 1-15 * *" });
    assert.equal(big.ok, false);
    if (!big.ok) assert.match(big.error, new RegExp(String(LAUNCHD_MAX_CALENDAR_ENTRIES)));
  });
});

describe("buildLaunchdPlist", () => {
  it("renders a LaunchAgent with escaped arguments and environment", () => {
    const r = buildLaunchdPlist({
      label: "com.ai-shelf.flow-due",
      programArguments: ["/Applications/AI Shelf.app/Contents/MacOS/AI Shelf", "/x/cli.js", "due"],
      schedule: { kind: "cron", expression: "0 9 * * 1" },
      environment: { ELECTRON_RUN_AS_NODE: "1" },
      workingDirectory: "/tmp/a&b",
      standardOutPath: "/tmp/flow-due.log",
      standardErrorPath: "/tmp/flow-due.log",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.match(r.plist, /^<\?xml version="1.0"/);
    assert.match(r.plist, /<key>Label<\/key>\n {2}<string>com\.ai-shelf\.flow-due<\/string>/);
    assert.match(
      r.plist,
      /<string>\/Applications\/AI Shelf\.app\/Contents\/MacOS\/AI Shelf<\/string>/,
    );
    assert.match(r.plist, /<string>\/tmp\/a&amp;b<\/string>/);
    assert.match(r.plist, /<key>ELECTRON_RUN_AS_NODE<\/key>\n {4}<string>1<\/string>/);
    assert.match(
      r.plist,
      /<key>StartCalendarInterval<\/key>\n {2}<dict>\n {4}<key>Weekday<\/key>\n {4}<integer>1<\/integer>\n {4}<key>Hour<\/key>\n {4}<integer>9<\/integer>\n {4}<key>Minute<\/key>\n {4}<integer>0<\/integer>\n {2}<\/dict>/,
    );
    assert.match(r.plist, /<key>RunAtLoad<\/key>\n {2}<false\/>/);
    assert.doesNotMatch(r.plist, /StartInterval<\/key>\n {2}<integer>/);
  });

  it("uses an array for multiple calendar entries and StartInterval otherwise", () => {
    const multi = buildLaunchdPlist({
      label: "l",
      programArguments: ["/bin/true"],
      schedule: { kind: "interval", minutes: 30 },
    });
    assert.ok(multi.ok);
    if (multi.ok)
      assert.match(multi.plist, /<key>StartCalendarInterval<\/key>\n {2}<array>\n {4}<dict>/);
    const interval = buildLaunchdPlist({
      label: "l",
      programArguments: ["/bin/true"],
      schedule: { kind: "interval", minutes: 90 },
    });
    assert.ok(interval.ok);
    if (interval.ok)
      assert.match(interval.plist, /<key>StartInterval<\/key>\n {2}<integer>5400<\/integer>/);
  });
});

describe("mapScheduleToSystemd", () => {
  it("maps intervals", () => {
    assert.deepEqual(mapScheduleToSystemd({ kind: "interval", minutes: 1 }), {
      ok: true,
      onCalendar: ["*-*-* *:*:00"],
    });
    assert.deepEqual(mapScheduleToSystemd({ kind: "interval", minutes: 10 }), {
      ok: true,
      onCalendar: ["*-*-* *:00/10:00"],
    });
    assert.deepEqual(mapScheduleToSystemd({ kind: "interval", minutes: 90 }), {
      ok: true,
      onCalendar: [],
      onActiveSec: "90min",
      onUnitActiveSec: "90min",
    });
  });

  it("maps cron fields and time zones to OnCalendar", () => {
    const r = mapScheduleToSystemd({
      kind: "cron",
      expression: "30 9 * 1,6 mon-fri",
      timezone: "Asia/Taipei",
    });
    assert.deepEqual(r, {
      ok: true,
      onCalendar: ["Mon,Tue,Wed,Thu,Fri *-01,06-* 09:30:00 Asia/Taipei"],
    });
  });

  it("splits restricted day-of-month and day-of-week into two OR'd lines", () => {
    const r = mapScheduleToSystemd({ kind: "cron", expression: "0 0 1 * sun" });
    assert.deepEqual(r, { ok: true, onCalendar: ["*-*-01 00:00:00", "Sun *-*-* 00:00:00"] });
  });

  it("rejects invalid cron", () => {
    assert.equal(mapScheduleToSystemd({ kind: "cron", expression: "bogus" }).ok, false);
  });
});

describe("systemd unit files", () => {
  it("quotes ExecStart arguments and escapes specifiers", () => {
    assert.equal(quoteSystemdArg("/usr/bin/app"), "/usr/bin/app");
    assert.equal(quoteSystemdArg("/opt/AI Shelf/app"), '"/opt/AI Shelf/app"');
    assert.equal(quoteSystemdArg("100%"), "100%%");
    assert.equal(quoteSystemdArg("$HOME"), "$$HOME");
    assert.equal(quoteSystemdArg('a"b'), '"a\\"b"');
  });

  it("renders a oneshot service", () => {
    const service = buildSystemdService({
      description: "AI Shelf — run due AI Flows",
      execStart: [
        "/opt/AI Shelf/ai-shelf",
        "/opt/AI Shelf/resources/app.asar/dist/flow/cli.js",
        "due",
      ],
      environment: { ELECTRON_RUN_AS_NODE: "1" },
      workingDirectory: "/home/me/ai-shelf",
    });
    assert.equal(
      service,
      [
        "[Unit]",
        "Description=AI Shelf — run due AI Flows",
        "",
        "[Service]",
        "Type=oneshot",
        "WorkingDirectory=/home/me/ai-shelf",
        "Environment=ELECTRON_RUN_AS_NODE=1",
        'ExecStart="/opt/AI Shelf/ai-shelf" "/opt/AI Shelf/resources/app.asar/dist/flow/cli.js" due',
        "",
      ].join("\n"),
    );
  });

  it("renders a timer bound to the service", () => {
    const r = buildSystemdTimer({
      description: "AI Shelf — run due AI Flows",
      unit: "ai-shelf-flow-due.service",
      schedule: { kind: "interval", minutes: 1 },
    });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(
        r.timer,
        [
          "[Unit]",
          "Description=AI Shelf — run due AI Flows",
          "",
          "[Timer]",
          "OnCalendar=*-*-* *:*:00",
          "AccuracySec=1s",
          "Unit=ai-shelf-flow-due.service",
          "",
          "[Install]",
          "WantedBy=timers.target",
          "",
        ].join("\n"),
      );
    }
  });
});

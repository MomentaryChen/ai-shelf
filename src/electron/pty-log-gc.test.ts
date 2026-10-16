import assert from "node:assert/strict";
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  normalizePtyLogRetention,
  ptyLogGroupKey,
  runPtyLogGc,
  selectPtyLogsToDelete,
  type PtyLogFileInfo,
} from "./pty-log-gc.js";

const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
const NOW = Date.UTC(2026, 9, 16);
const NONE = new Set<string>();

function log(tool: string, ageDays: number, size = 1, seq = 0): PtyLogFileInfo {
  const ts = NOW - ageDays * DAY;
  const hex = (seq + 0xa0000000).toString(16).slice(-8);
  return { name: `${tool}-${ts}-${hex}.log`, size, mtimeMs: ts };
}

const OFF = { maxAgeDays: 0, maxTotalMb: 0, maxFilesPerTool: 0 };

describe("ptyLogGroupKey", () => {
  it("strips the timestamp + uuid suffix, keeping dashed tool ids", () => {
    assert.equal(ptyLogGroupKey("claude-code-1712345678901-abcd1234"), "claude-code");
    assert.equal(ptyLogGroupKey("weird"), "weird");
  });
});

describe("normalizePtyLogRetention", () => {
  it("clamps and falls back to defaults", () => {
    const p = normalizePtyLogRetention({ maxAgeDays: -5, maxTotalMb: "abc", maxFilesPerTool: 3.6 });
    assert.equal(p.maxAgeDays, 0);
    assert.equal(p.maxTotalMb, 200);
    assert.equal(p.maxFilesPerTool, 4);
  });
});

describe("selectPtyLogsToDelete", () => {
  it("deletes nothing when every limit is off", () => {
    const files = [log("a", 100), log("a", 1)];
    assert.deepEqual(
      selectPtyLogsToDelete(files, OFF, { now: NOW, protectedSessionIds: NONE }),
      [],
    );
  });

  it("deletes logs older than maxAgeDays", () => {
    const old = log("a", 20);
    const fresh = log("a", 2, 1, 1);
    const out = selectPtyLogsToDelete(
      [old, fresh],
      { ...OFF, maxAgeDays: 14 },
      {
        now: NOW,
        protectedSessionIds: NONE,
      },
    );
    assert.deepEqual(out, [old.name]);
  });

  it("never deletes protected (running) sessions", () => {
    const old = log("a", 400);
    const id = old.name.replace(/\.log$/, "");
    const out = selectPtyLogsToDelete(
      [old],
      { maxAgeDays: 1, maxTotalMb: 1, maxFilesPerTool: 1 },
      {
        now: NOW,
        protectedSessionIds: new Set([id]),
      },
    );
    assert.deepEqual(out, []);
  });

  it("keeps the newest N per tool", () => {
    const a = [log("a", 1, 1, 1), log("a", 2, 1, 2), log("a", 3, 1, 3)];
    const b = [log("b", 9, 1, 4)];
    const out = selectPtyLogsToDelete(
      [...a, ...b],
      { ...OFF, maxFilesPerTool: 2 },
      {
        now: NOW,
        protectedSessionIds: NONE,
      },
    );
    assert.deepEqual(out, [a[2]!.name]);
  });

  it("protected logs count toward the per-tool cap", () => {
    const live = log("a", 0, 1, 1);
    const older = log("a", 5, 1, 2);
    const out = selectPtyLogsToDelete(
      [live, older],
      { ...OFF, maxFilesPerTool: 1 },
      {
        now: NOW,
        protectedSessionIds: new Set([live.name.slice(0, -4)]),
      },
    );
    assert.deepEqual(out, [older.name]);
  });

  it("trims oldest first until under maxTotalMb, skipping protected", () => {
    const oldest = log("a", 10, 2 * MB, 1);
    const mid = log("b", 5, 2 * MB, 2);
    const newest = log("c", 1, 2 * MB, 3);
    const out = selectPtyLogsToDelete(
      [newest, oldest, mid],
      { ...OFF, maxTotalMb: 3 },
      {
        now: NOW,
        protectedSessionIds: new Set([oldest.name.slice(0, -4)]),
      },
    );
    // oldest is protected → mid then newest... stop once total ≤ 3 MB.
    assert.deepEqual(out.sort(), [mid.name, newest.name].sort());
  });

  it("ignores non-log files", () => {
    const out = selectPtyLogsToDelete(
      [{ name: "notes.txt", size: 10 * MB, mtimeMs: 0 }],
      { maxAgeDays: 1, maxTotalMb: 1, maxFilesPerTool: 1 },
      { now: NOW, protectedSessionIds: NONE },
    );
    assert.deepEqual(out, []);
  });
});

describe("runPtyLogGc", () => {
  it("unlinks selected files in a temp dir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aishelf-ptylog-"));
    const oldName = "a-1000-aaaaaaaa.log";
    const liveName = "a-2000-bbbbbbbb.log";
    const newName = "a-3000-cccccccc.log";
    for (const n of [oldName, liveName, newName]) writeFileSync(join(dir, n), "x");
    const oldSec = (NOW - 30 * DAY) / 1000;
    utimesSync(join(dir, oldName), oldSec, oldSec);
    utimesSync(join(dir, liveName), oldSec, oldSec);
    const res = await runPtyLogGc(
      dir,
      { ...OFF, maxAgeDays: 7 },
      {
        now: NOW,
        protectedSessionIds: new Set(["a-2000-bbbbbbbb"]),
      },
    );
    assert.equal(res.deleted, 1);
    assert.equal(existsSync(join(dir, oldName)), false);
    assert.equal(existsSync(join(dir, liveName)), true);
    assert.equal(existsSync(join(dir, newName)), true);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLongCommand,
  isPaneUnattended,
  NotifyRateLimiter,
  PaneNotifyDedupe,
  parseOsc777,
  parseOsc9,
  sanitizeNotifyText,
} from "./terminal-notify";

describe("sanitizeNotifyText", () => {
  it("strips control characters and collapses whitespace", () => {
    assert.equal(sanitizeNotifyText("a\x1b[31mb\x07\n  c\u009b"), "a [31mb c");
  });
  it("caps length with an ellipsis", () => {
    assert.equal(sanitizeNotifyText("abcdefghij", 5), "abcd…");
    assert.equal(sanitizeNotifyText("abcde", 5), "abcde");
  });
});

describe("parseOsc9", () => {
  it("treats free text as a notification body", () => {
    assert.deepEqual(parseOsc9("Build finished"), { title: "", body: "Build finished" });
  });
  it("ignores ConEmu / Windows Terminal numeric subcommands", () => {
    assert.equal(parseOsc9("4;1;50"), null);
    assert.equal(parseOsc9("9;C:\\Users"), null);
    assert.equal(parseOsc9("4"), null);
  });
  it("ignores empty payloads", () => {
    assert.equal(parseOsc9("   "), null);
  });
  it("keeps text that merely starts with a digit", () => {
    assert.deepEqual(parseOsc9("3 tests failed"), { title: "", body: "3 tests failed" });
  });
});

describe("parseOsc777", () => {
  it("parses notify;title;body and keeps ; in the body", () => {
    assert.deepEqual(parseOsc777("notify;Claude;Done; 3 files"), {
      title: "Claude",
      body: "Done; 3 files",
    });
  });
  it("accepts a title without a body", () => {
    assert.deepEqual(parseOsc777("notify;Hi"), { title: "Hi", body: "" });
  });
  it("ignores other subcommands and empty notifications", () => {
    assert.equal(parseOsc777("preexec"), null);
    assert.equal(parseOsc777("notify;;"), null);
  });
});

describe("isPaneUnattended", () => {
  const base = { viewActive: true, windowFocused: true, focusedPaneId: "p1" };
  it("is false for the focused pane in a focused window", () => {
    assert.equal(isPaneUnattended("p1", base), false);
  });
  it("is true for another pane, an unfocused window, or a hidden view", () => {
    assert.equal(isPaneUnattended("p2", base), true);
    assert.equal(isPaneUnattended("p1", { ...base, windowFocused: false }), true);
    assert.equal(isPaneUnattended("p1", { ...base, viewActive: false }), true);
  });
});

describe("isLongCommand", () => {
  const ev = (durationMs: number | null) =>
    ({ kind: "command", command: "x", exitCode: 0, durationMs }) as const;
  it("compares duration to the threshold", () => {
    assert.equal(isLongCommand(ev(9_999), 10), false);
    assert.equal(isLongCommand(ev(10_000), 10), true);
    assert.equal(isLongCommand(ev(null), 10), false);
  });
});

describe("NotifyRateLimiter", () => {
  it("enforces a per-key gap", () => {
    const rl = new NotifyRateLimiter({ max: 100, windowMs: 1000 });
    assert.equal(rl.allow("p1:bell", 30_000, 0), true);
    assert.equal(rl.allow("p1:bell", 30_000, 10_000), false);
    assert.equal(rl.allow("p2:bell", 30_000, 10_000), true);
    assert.equal(rl.allow("p1:bell", 30_000, 30_000), true);
  });
  it("caps bursts across keys", () => {
    const rl = new NotifyRateLimiter({ max: 2, windowMs: 1000 });
    assert.equal(rl.allow("a", 0, 0), true);
    assert.equal(rl.allow("b", 0, 1), true);
    assert.equal(rl.allow("c", 0, 2), false);
    assert.equal(rl.allow("c", 0, 1001), true);
  });
  it("forget clears a pane's keys", () => {
    const rl = new NotifyRateLimiter({ max: 100, windowMs: 1000 });
    rl.allow("p1:bell", 30_000, 0);
    rl.forget("p1:");
    assert.equal(rl.allow("p1:bell", 30_000, 1), true);
  });
});

describe("PaneNotifyDedupe", () => {
  it("blocks the other source within the window, not the same source", () => {
    const d = new PaneNotifyDedupe();
    assert.equal(d.claim("p1", "terminal", 0), true);
    assert.equal(d.claim("p1", "agent", 8_000), false);
    assert.equal(d.claim("p1", "terminal", 9_000), true);
    assert.equal(d.claim("p2", "agent", 9_000), true);
    assert.equal(d.claim("p1", "agent", 40_000), true);
  });
});

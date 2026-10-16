/* eslint-disable @typescript-eslint/no-floating-promises -- node:test tracks describe/it promises itself */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySession,
  isPidAlive,
  remoteSessionMessage,
  remoteTerminateSignal,
  type ClassifyOptions,
} from "./session-liveness.js";

const SELF = 1000;
const OWNER = 2000;
const PTY = 3000;

function opts(alive: number[], hasLocalHandle = false): ClassifyOptions {
  return { hasLocalHandle, selfPid: SELF, isAlive: (pid) => alive.includes(pid) };
}

describe("classifySession", () => {
  it("prefers the local handle over DB state", () => {
    const s = { status: "running" as const, pid: PTY, owner_pid: SELF };
    assert.deepEqual(classifySession(s, opts([], true)), { kind: "local" });
  });

  it("treats non-running rows as idle", () => {
    for (const status of ["pending", "stopped", "failed"] as const) {
      assert.deepEqual(classifySession({ status, pid: null, owner_pid: null }, opts([])), {
        kind: "idle",
      });
    }
  });

  it("reports a live PTY owned by another live process as remote", () => {
    const s = { status: "running" as const, pid: PTY, owner_pid: OWNER };
    assert.deepEqual(classifySession(s, opts([OWNER, PTY])), {
      kind: "remote",
      pid: PTY,
      ownerPid: OWNER,
    });
  });

  it("marks running rows stale when the owner process is gone", () => {
    const s = { status: "running" as const, pid: PTY, owner_pid: OWNER };
    assert.deepEqual(classifySession(s, opts([PTY])), { kind: "stale" });
  });

  it("marks running rows stale when the PTY process is gone", () => {
    const s = { status: "running" as const, pid: PTY, owner_pid: OWNER };
    assert.deepEqual(classifySession(s, opts([OWNER])), { kind: "stale" });
  });

  it("marks rows claimed by this process without a handle as stale", () => {
    const s = { status: "running" as const, pid: PTY, owner_pid: SELF };
    assert.deepEqual(classifySession(s, opts([SELF, PTY])), { kind: "stale" });
  });

  it("never trusts legacy rows without owner_pid (pid may be recycled)", () => {
    const s = { status: "running" as const, pid: PTY, owner_pid: null };
    assert.deepEqual(classifySession(s, opts([PTY])), { kind: "stale" });
  });

  it("marks running rows without a pid as stale", () => {
    const s = { status: "running" as const, pid: null, owner_pid: OWNER };
    assert.deepEqual(classifySession(s, opts([OWNER])), { kind: "stale" });
  });
});

describe("isPidAlive", () => {
  it("sees the current process", () => {
    assert.equal(isPidAlive(process.pid), true);
  });

  it("rejects invalid pids without probing", () => {
    assert.equal(isPidAlive(0), false);
    assert.equal(isPidAlive(-1), false);
    assert.equal(isPidAlive(1.5), false);
  });
});

describe("remoteTerminateSignal", () => {
  it("hangs up POSIX shells (they ignore SIGTERM when interactive)", () => {
    assert.equal(remoteTerminateSignal("linux"), "SIGHUP");
    assert.equal(remoteTerminateSignal("darwin"), "SIGHUP");
  });

  it("uses SIGTERM on Windows, where process.kill terminates", () => {
    assert.equal(remoteTerminateSignal("win32"), "SIGTERM");
  });
});

describe("remoteSessionMessage", () => {
  it("names the session, the owner pid and the way forward", () => {
    const msg = remoteSessionMessage("api", 4242);
    assert.match(msg, /"api"/);
    assert.match(msg, /pid 4242/);
    assert.match(msg, /ai-shelf tui/);
  });
});

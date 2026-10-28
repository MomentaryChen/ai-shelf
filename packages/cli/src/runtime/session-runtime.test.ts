/* eslint-disable @typescript-eslint/no-floating-promises -- node:test tracks describe/it promises itself */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IPty } from "node-pty";
import type { SessionModel } from "../models/session.js";
import { EventBus } from "./event-bus.js";
import { ProcessRegistry } from "./process-registry.js";
import type { PtyRuntime, PtySpawnOptions } from "./pty-runtime.js";
import {
  SessionRuntime,
  type SessionRuntimeHost,
  type SessionRuntimeUpdatePort,
} from "./session-runtime.js";

const SELF = 1000;
const OTHER = 2000;

function makeSession(patch: Partial<SessionModel> = {}): SessionModel {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workspace_id: "00000000-0000-4000-8000-000000000002",
    group_id: "00000000-0000-4000-8000-000000000003",
    name: "api",
    cwd: "/tmp",
    shell: "auto",
    tool: null,
    pid: null,
    owner_pid: null,
    status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

/** In-memory PTY runtime: tracks live handles and lets tests fire onExit. */
class FakePty {
  readonly live = new Map<string, PtySpawnOptions>();
  readonly writes: string[] = [];
  nextPid = 5000;

  spawn(runtimeId: string, options: PtySpawnOptions): Promise<{ runtimeId: string; pid: number }> {
    this.live.set(runtimeId, options);
    return Promise.resolve({ runtimeId, pid: this.nextPid++ });
  }
  get(runtimeId: string): IPty | undefined {
    return this.live.has(runtimeId) ? ({} as IPty) : undefined;
  }
  kill(runtimeId: string): void {
    this.live.delete(runtimeId);
  }
  write(_runtimeId: string, data: string): void {
    this.writes.push(data);
  }
  getPreview(): string {
    return "";
  }
  /** The single live PTY and its spawn options. */
  only(): [string, PtySpawnOptions] {
    const entries = [...this.live.entries()];
    assert.equal(entries.length, 1);
    return entries[0] as [string, PtySpawnOptions];
  }
  /** Simulate node-pty's async onExit after the process ends on its own. */
  exit(runtimeId: string, options: PtySpawnOptions): void {
    this.live.delete(runtimeId);
    options.onExit?.(0);
  }
}

class FakeStore implements SessionRuntimeUpdatePort {
  readonly updates: { id: string; status: SessionModel["status"] }[] = [];
  closed = false;
  constructor(public row: SessionModel) {}
  updateRuntime(
    id: string,
    patch: { pid?: number | null; owner_pid?: number | null; status: SessionModel["status"] },
  ): SessionModel {
    if (this.closed) throw new TypeError("The database connection is not open");
    this.row = {
      ...this.row,
      pid: patch.pid !== undefined ? patch.pid : this.row.pid,
      owner_pid: patch.owner_pid !== undefined ? patch.owner_pid : this.row.owner_pid,
      status: patch.status,
    };
    this.updates.push({ id, status: patch.status });
    return this.row;
  }
}

function setup(row: SessionModel, alive: number[] = []) {
  const pty = new FakePty();
  const store = new FakeStore(row);
  const kills: { pid: number; signal: NodeJS.Signals }[] = [];
  const host: SessionRuntimeHost = {
    selfPid: SELF,
    platform: "linux",
    isAlive: (pid) => alive.includes(pid),
    kill: (pid, signal) => {
      kills.push({ pid, signal });
    },
  };
  const runtime = new SessionRuntime(
    new ProcessRegistry(),
    pty as unknown as PtyRuntime,
    new EventBus(),
    store,
    host,
  );
  return { pty, store, kills, runtime };
}

describe("SessionRuntime", () => {
  it("records pid and owner pid on start", async () => {
    const { runtime, store } = setup(makeSession());
    const { pid } = await runtime.start(store.row);
    assert.equal(store.row.status, "running");
    assert.equal(store.row.pid, pid);
    assert.equal(store.row.owner_pid, SELF);
    assert.equal(runtime.ownership(store.row).kind, "local");
  });

  it("marks the session stopped when the PTY exits on its own", async () => {
    const { runtime, store, pty } = setup(makeSession());
    await runtime.start(store.row);
    const [runtimeId, options] = pty.only();
    pty.exit(runtimeId, options);
    assert.equal(store.row.status, "stopped");
    assert.equal(store.row.owner_pid, null);
  });

  it("does not touch the (closed) DB when a stopped PTY reports exit later", async () => {
    const { runtime, store, pty } = setup(makeSession());
    await runtime.start(store.row);
    const [, options] = pty.only();
    assert.equal(runtime.stopAllOwned(), 1);
    store.closed = true;
    const before = store.updates.length;
    assert.doesNotThrow(() => {
      options.onExit?.(0);
    });
    assert.equal(store.updates.length, before);
  });

  it("survives a natural PTY exit after the DB was closed", async () => {
    const { runtime, store, pty } = setup(makeSession());
    await runtime.start(store.row);
    const [runtimeId, options] = pty.only();
    store.closed = true;
    assert.doesNotThrow(() => {
      pty.exit(runtimeId, options);
    });
  });

  it("stopAllOwned kills every local PTY and marks it stopped", async () => {
    const { runtime, store, pty } = setup(makeSession());
    await runtime.start(store.row);
    assert.equal(runtime.stopAllOwned(), 1);
    assert.equal(pty.live.size, 0);
    assert.equal(store.row.status, "stopped");
    assert.equal(runtime.stopAllOwned(), 0);
  });

  it("reconcile clears rows whose owner died", () => {
    const row = makeSession({ status: "running", pid: 7000, owner_pid: OTHER });
    const { runtime } = setup(row, [7000]);
    const fresh = runtime.reconcile(row);
    assert.equal(fresh.status, "stopped");
    assert.equal(fresh.pid, null);
  });

  it("reconcile keeps live remote sessions untouched", () => {
    const row = makeSession({ status: "running", pid: 7000, owner_pid: OTHER });
    const { runtime, store } = setup(row, [7000, OTHER]);
    assert.equal(runtime.reconcile(row), row);
    assert.equal(store.updates.length, 0);
  });

  it("stop terminates a remote PTY by pid and updates the DB", () => {
    const row = makeSession({ status: "running", pid: 7000, owner_pid: OTHER });
    const { runtime, store, kills } = setup(row, [7000, OTHER]);
    runtime.stop(row);
    assert.deepEqual(kills, [{ pid: 7000, signal: "SIGHUP" }]);
    assert.equal(store.row.status, "stopped");
  });

  it("stop on a stale row just marks it stopped", () => {
    const row = makeSession({ status: "running", pid: 7000, owner_pid: OTHER });
    const { runtime, store, kills } = setup(row, []);
    runtime.stop(row);
    assert.equal(kills.length, 0);
    assert.equal(store.row.status, "stopped");
  });

  it("stop on an idle session is an error", () => {
    const row = makeSession({ status: "stopped" });
    const { runtime } = setup(row);
    assert.throws(() => {
      runtime.stop(row);
    }, /is not running/);
  });

  it("write into a remote session explains the cross-process limitation", () => {
    const row = makeSession({ status: "running", pid: 7000, owner_pid: OTHER });
    const { runtime, pty } = setup(row, [7000, OTHER]);
    assert.throws(() => {
      runtime.write(row, "ls\r");
    }, /another ai-shelf process \(pid 2000\).*ai-shelf tui/s);
    assert.equal(pty.writes.length, 0);
  });

  it("write reaches a local PTY", async () => {
    const { runtime, store, pty } = setup(makeSession());
    await runtime.start(store.row);
    runtime.write(store.row, "ls\r");
    assert.deepEqual(pty.writes, ["ls\r"]);
  });

  it("refuses to start a session that is live in another process", async () => {
    const row = makeSession({ status: "running", pid: 7000, owner_pid: OTHER });
    const { runtime } = setup(row, [7000, OTHER]);
    await assert.rejects(runtime.start(row), /another ai-shelf process \(pid 2000\)/);
  });
});

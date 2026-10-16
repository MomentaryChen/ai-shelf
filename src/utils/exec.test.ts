import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runStreaming } from "./exec.js";

const node = process.execPath;

describe("runStreaming", () => {
  it("succeeds on exit code 0", async () => {
    const r = await runStreaming(node, ["-e", "process.exit(0)"], { timeoutMs: 30_000 });
    assert.equal(r.ok, true);
    assert.equal(r.code, 0);
    assert.equal(r.timedOut, false);
  });

  it("fails with the exit code on non-zero exit", async () => {
    const r = await runStreaming(node, ["-e", "process.exit(3)"], { timeoutMs: 30_000 });
    assert.equal(r.ok, false);
    assert.equal(r.code, 3);
    assert.equal(r.timedOut, false);
  });

  it("kills and flags the process when it exceeds the timeout", async () => {
    const r = await runStreaming(node, ["-e", "setTimeout(() => {}, 60000)"], {
      timeoutMs: 300,
    });
    assert.equal(r.ok, false);
    assert.equal(r.timedOut, true);
  });

  it("reports spawn errors for missing commands", async () => {
    const r = await runStreaming(`${node}-does-not-exist.exe`, [], { timeoutMs: 5_000 });
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });
});

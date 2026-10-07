import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldRespawnLostSession,
  shouldWakeShellWithEnter,
} from "./pty-attach-session.js";

describe("shouldRespawnLostSession", () => {
  it("respawns only when no meta remains for the session", () => {
    assert.equal(
      shouldRespawnLostSession({ exitCode: null, shell: null, pid: null }),
      true,
    );
  });

  it("keeps a clean exit dead on remount", () => {
    assert.equal(
      shouldRespawnLostSession({ exitCode: 0, shell: "pwsh.exe", pid: 1234 }),
      false,
    );
  });

  it("keeps a killed session dead even before exitCode lands", () => {
    assert.equal(
      shouldRespawnLostSession({ exitCode: null, shell: "bash", pid: 99 }),
      false,
    );
  });

  it("keeps a session with only exitCode dead", () => {
    assert.equal(
      shouldRespawnLostSession({ exitCode: -1, shell: null, pid: null }),
      false,
    );
  });
});

describe("shouldWakeShellWithEnter", () => {
  it("wakes plain shell sessions only", () => {
    assert.equal(shouldWakeShellWithEnter("shell-1710000000-abcd"), true);
    assert.equal(shouldWakeShellWithEnter("claude-1710000000-abcd"), false);
    assert.equal(shouldWakeShellWithEnter("codex-1710000000-abcd"), false);
  });
});

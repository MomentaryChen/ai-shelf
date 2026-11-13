import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTerminalTitle } from "./terminal-title";

describe("normalizeTerminalTitle", () => {
  it("strips Claude Code status / spinner prefixes", () => {
    assert.equal(normalizeTerminalTitle("✳ Fix login bug"), "Fix login bug");
    assert.equal(normalizeTerminalTitle("⠂ Fix login bug"), "Fix login bug");
    assert.equal(normalizeTerminalTitle("⠐ Fix login bug"), "Fix login bug");
  });

  it("keeps CJK titles", () => {
    assert.equal(normalizeTerminalTitle("✳ 更新 terminal 名稱"), "更新 terminal 名稱");
  });

  it("drops executable and bare path titles", () => {
    assert.equal(
      normalizeTerminalTitle("C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
      "",
    );
    assert.equal(normalizeTerminalTitle("Administrator: C:\\Windows\\system32\\cmd.exe"), "");
    assert.equal(normalizeTerminalTitle("/usr/bin/bash"), "");
    assert.equal(normalizeTerminalTitle("C:\\Users\\me"), "");
  });

  it("keeps shell-style user@host titles", () => {
    assert.equal(normalizeTerminalTitle("me@box: ~/src"), "me@box: ~/src");
  });

  it("removes control characters and collapses whitespace", () => {
    assert.equal(normalizeTerminalTitle("a\x1b[31m  b\n c"), "a [31m b c");
  });

  it("returns empty for blank / symbol-only titles", () => {
    assert.equal(normalizeTerminalTitle(""), "");
    assert.equal(normalizeTerminalTitle("  ✳  "), "");
  });

  it("caps length at 64", () => {
    assert.equal(normalizeTerminalTitle("x".repeat(100)).length, 64);
  });
});

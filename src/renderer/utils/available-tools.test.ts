import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLAIN_SHELL_TOOL_ID,
  resolveEmbeddedPtyShell,
  resolveLaunchTool,
} from "./available-tools.js";

describe("resolveLaunchTool", () => {
  it("keeps Claude when inventory has not listed it yet", () => {
    assert.equal(resolveLaunchTool("claude", []), "claude");
  });

  it("does not swap a named AI CLI for shell", () => {
    assert.equal(resolveLaunchTool("claude", ["codex"]), "claude");
  });

  it("maps empty or shell to plain shell", () => {
    assert.equal(resolveLaunchTool(undefined, ["claude"]), PLAIN_SHELL_TOOL_ID);
    assert.equal(resolveLaunchTool("shell", ["claude"]), PLAIN_SHELL_TOOL_ID);
  });

  it("maps unknown tool ids to plain shell instead of another AI CLI", () => {
    assert.equal(resolveLaunchTool("not-a-tool", ["claude"]), PLAIN_SHELL_TOOL_ID);
  });
});

describe("resolveEmbeddedPtyShell", () => {
  it("does not inherit cmd from external terminal when launching Claude", () => {
    assert.equal(resolveEmbeddedPtyShell("auto", "cmd", "claude"), "auto");
  });

  it("ignores preferred cmd for AI CLI panes", () => {
    assert.equal(resolveEmbeddedPtyShell("cmd", "cmd", "claude"), "auto");
  });

  it("honors cmd for interactive shell panes", () => {
    assert.equal(resolveEmbeddedPtyShell("cmd", "wt", "shell"), "cmd");
    assert.equal(resolveEmbeddedPtyShell("auto", "cmd", "shell"), "cmd");
  });

  it("keeps pwsh preference for AI CLI panes", () => {
    assert.equal(resolveEmbeddedPtyShell("pwsh", "cmd", "claude"), "pwsh");
  });
});

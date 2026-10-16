import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  claudeConfigDir,
  claudeJsonPath,
  codexHome,
  getMcpConfigPath,
  xdgConfigHome,
} from "./config.js";

const ENV_KEYS = ["CLAUDE_CONFIG_DIR", "XDG_CONFIG_HOME", "CODEX_HOME"] as const;

describe("config path env overrides", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults to home-relative locations", () => {
    assert.equal(claudeConfigDir(), join(homedir(), ".claude"));
    assert.equal(claudeJsonPath(), join(homedir(), ".claude.json"));
    assert.equal(xdgConfigHome("opencode"), join(homedir(), ".config", "opencode"));
    assert.equal(codexHome("config.toml"), join(homedir(), ".codex", "config.toml"));
  });

  it("honors CLAUDE_CONFIG_DIR for settings and .claude.json", () => {
    const dir = resolve("/tmp/claude-alt");
    process.env["CLAUDE_CONFIG_DIR"] = dir;
    assert.equal(claudeConfigDir("settings.json"), join(dir, "settings.json"));
    assert.equal(claudeJsonPath(), join(dir, ".claude.json"));
    assert.equal(getMcpConfigPath("claude"), join(dir, ".claude.json"));
  });

  it("honors absolute XDG_CONFIG_HOME and CODEX_HOME", () => {
    const xdg = resolve("/tmp/xdg");
    const codex = resolve("/tmp/codex");
    process.env["XDG_CONFIG_HOME"] = xdg;
    process.env["CODEX_HOME"] = codex;
    assert.equal(xdgConfigHome("crush"), join(xdg, "crush"));
    assert.equal(getMcpConfigPath("codex"), join(codex, "config.toml"));
  });

  it("ignores relative or blank overrides", () => {
    process.env["XDG_CONFIG_HOME"] = "relative";
    process.env["CLAUDE_CONFIG_DIR"] = "  ";
    assert.equal(xdgConfigHome(), join(homedir(), ".config"));
    assert.equal(claudeConfigDir(), join(homedir(), ".claude"));
  });
});

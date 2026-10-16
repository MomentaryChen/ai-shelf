import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  claudeSkillRoots,
  codexSkillRoots,
  copilotSkillRoots,
  opencodeSkillRoots,
  scanSkillsFromRoots,
} from "./skills-scan.js";

const ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "CLAUDE_CONFIG_DIR",
  "XDG_CONFIG_HOME",
  "COPILOT_HOME",
  "CODEX_HOME",
  "OPENCODE_CONFIG_DIR",
] as const;

function writeSkill(root: string, folder: string, name = folder): void {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n\nbody\n`,
    "utf-8",
  );
}

describe("tool skill roots", () => {
  let fakeHome: string;
  let project: string;
  let savedCwd: string;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), "aishelf-skills-"));
    fakeHome = join(base, "home");
    project = join(base, "project");
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(project, { recursive: true });
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env["HOME"] = fakeHome;
    process.env["USERPROFILE"] = fakeHome;
    savedCwd = process.cwd();
    process.chdir(project);
  });

  afterEach(() => {
    process.chdir(savedCwd);
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("finds Copilot personal and project skills", () => {
    writeSkill(join(fakeHome, ".copilot", "skills"), "personal");
    writeSkill(join(project, ".github", "skills"), "gh-project");
    writeSkill(join(project, ".agents", "skills"), "agents-project");

    const names = scanSkillsFromRoots(copilotSkillRoots()).map((s) => s.name);
    assert.deepEqual(names, ["agents-project", "gh-project", "personal"]);
  });

  it("honors COPILOT_HOME for Copilot personal skills", () => {
    const copilotHome = join(fakeHome, "custom-copilot");
    writeSkill(join(copilotHome, "skills"), "custom");
    process.env["COPILOT_HOME"] = copilotHome;

    const skills = scanSkillsFromRoots(copilotSkillRoots());
    assert.deepEqual(
      skills.map((s) => [s.name, s.scope]),
      [["custom", "global"]],
    );
  });

  it("finds Codex skills in CODEX_HOME, ~/.agents and the repo", () => {
    const codexHome = join(fakeHome, "codex-home");
    writeSkill(join(codexHome, "skills"), "legacy-user");
    writeSkill(join(fakeHome, ".agents", "skills"), "user");
    writeSkill(join(project, ".agents", "skills"), "repo");
    process.env["CODEX_HOME"] = codexHome;

    const skills = scanSkillsFromRoots(codexSkillRoots());
    assert.deepEqual(
      skills.map((s) => [s.name, s.scope]),
      [
        ["legacy-user", "global"],
        ["repo", "project"],
        ["user", "global"],
      ],
    );
  });

  it("finds OpenCode skills under XDG_CONFIG_HOME and .opencode/skills", () => {
    const xdg = join(fakeHome, "xdg");
    writeSkill(join(xdg, "opencode", "skills"), "global-oc");
    writeSkill(join(project, ".opencode", "skills"), "project-oc");
    writeSkill(join(project, ".claude", "skills"), "claude-compat");
    process.env["XDG_CONFIG_HOME"] = xdg;

    const names = scanSkillsFromRoots(opencodeSkillRoots()).map((s) => s.name);
    assert.deepEqual(names, ["claude-compat", "global-oc", "project-oc"]);
  });

  it("ignores a relative XDG_CONFIG_HOME and falls back to ~/.config", () => {
    writeSkill(join(fakeHome, ".config", "opencode", "skills"), "dot-config");
    process.env["XDG_CONFIG_HOME"] = "relative/xdg";

    const names = scanSkillsFromRoots(opencodeSkillRoots()).map((s) => s.name);
    assert.deepEqual(names, ["dot-config"]);
  });

  it("reads Claude global skills from CLAUDE_CONFIG_DIR", () => {
    const configDir = join(fakeHome, "alt-claude");
    writeSkill(join(configDir, "skills"), "alt");
    writeSkill(join(fakeHome, ".claude", "skills"), "default-dir");
    process.env["CLAUDE_CONFIG_DIR"] = configDir;

    const names = scanSkillsFromRoots(claudeSkillRoots()).map((s) => s.name);
    assert.deepEqual(names, ["alt"]);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentSessionSupported,
  claudeProjectDirMatches,
  encodeClaudeProjectDir,
  isValidAgentSessionId,
  planAgentSessionLaunch,
  userArgsControlSession,
} from "./agent-session-resume.js";

const OLD_ID = "11111111-2222-4333-8444-555555555555";
const NEW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("encodeClaudeProjectDir", () => {
  // Same shapes as folder names Claude Code writes (`:` `\` `.` space and UNC paths).
  it("matches the folder names Claude Code writes", () => {
    assert.equal(
      encodeClaudeProjectDir("D:\\src\\my-repo\\.claude\\worktrees\\agent-1"),
      "D--src-my-repo--claude-worktrees-agent-1",
    );
    assert.equal(
      encodeClaudeProjectDir("C:\\Users\\dev\\AppData\\Local\\Programs\\AI Shelf"),
      "C--Users-dev-AppData-Local-Programs-AI-Shelf",
    );
    assert.equal(
      encodeClaudeProjectDir("\\\\host.name\\Distro-1.0\\home\\dev\\repo"),
      "--host-name-Distro-1-0-home-dev-repo",
    );
  });

  // Assumed from the same rule; no underscore folder was available to confirm it.
  it("replaces underscores too", () => {
    assert.equal(encodeClaudeProjectDir("/home/dev/my_app"), "-home-dev-my-app");
  });
});

describe("claudeProjectDirMatches", () => {
  it("ignores drive-letter case on case-insensitive filesystems", () => {
    assert.equal(claudeProjectDirMatches("d--workspace", "D:\\workspace", true), true);
    assert.equal(claudeProjectDirMatches("d--workspace", "D:\\workspace", false), false);
  });

  it("matches Claude's shortened name for very long paths", () => {
    const cwd = `/${"a".repeat(250)}`;
    const shortened = `${encodeClaudeProjectDir(cwd).slice(0, 200)}-1x2y3z`;
    assert.equal(claudeProjectDirMatches(shortened, cwd, false), true);
    assert.equal(claudeProjectDirMatches(shortened, "/other", false), false);
  });
});

describe("userArgsControlSession", () => {
  it("detects conversation flags as whole tokens", () => {
    for (const args of [
      "--resume",
      "--resume abc",
      "--resume=abc",
      "-r",
      "--continue",
      "-c",
      "--model opus -c",
      "--session-id x",
      "--session-id=x",
      "-cr",
    ]) {
      assert.equal(userArgsControlSession("claude", args), true, args);
    }
  });

  it("does not match flags that merely contain -c / -r", () => {
    for (const args of ["", "--chrome", "--model opus", "--dangerously-skip-permissions", "-p"]) {
      assert.equal(userArgsControlSession("claude", args), false, args);
    }
  });

  it("is false for tools without session support", () => {
    assert.equal(userArgsControlSession("codex", "--resume"), false);
  });
});

describe("isValidAgentSessionId", () => {
  it("accepts UUIDs only", () => {
    assert.equal(isValidAgentSessionId(OLD_ID), true);
    assert.equal(isValidAgentSessionId("abc; rm -rf /"), false);
    assert.equal(isValidAgentSessionId(undefined), false);
  });
});

describe("planAgentSessionLaunch", () => {
  const base = {
    tool: "claude",
    newId: () => NEW_ID,
  };

  it("starts fresh with a new session id", () => {
    const plan = planAgentSessionLaunch({ ...base, transcriptExists: () => false });
    assert.deepEqual(plan, {
      extraArgs: `--session-id ${NEW_ID}`,
      sessionId: NEW_ID,
      resumed: false,
    });
  });

  it("keeps user args and appends the session flag", () => {
    const plan = planAgentSessionLaunch({
      ...base,
      extraArgs: " --model opus ",
      transcriptExists: () => false,
    });
    assert.equal(plan.extraArgs, `--model opus --session-id ${NEW_ID}`);
  });

  it("resumes when the saved transcript exists", () => {
    const seen: string[] = [];
    const plan = planAgentSessionLaunch({
      ...base,
      resumeId: OLD_ID,
      transcriptExists: (id) => {
        seen.push(id);
        return true;
      },
    });
    assert.deepEqual(seen, [OLD_ID]);
    assert.deepEqual(plan, { extraArgs: `--resume ${OLD_ID}`, sessionId: OLD_ID, resumed: true });
  });

  it("launches fresh with a new id when the transcript is gone", () => {
    const plan = planAgentSessionLaunch({
      ...base,
      resumeId: OLD_ID,
      transcriptExists: () => false,
    });
    assert.equal(plan.sessionId, NEW_ID);
    assert.equal(plan.resumed, false);
  });

  it("never resumes an id that is not a UUID", () => {
    const plan = planAgentSessionLaunch({
      ...base,
      resumeId: "x; whoami",
      transcriptExists: () => true,
    });
    assert.equal(plan.sessionId, NEW_ID);
    assert.equal(plan.resumed, false);
  });

  it("adds nothing when the user args pick the conversation", () => {
    const plan = planAgentSessionLaunch({
      ...base,
      extraArgs: "--continue",
      resumeId: OLD_ID,
      transcriptExists: () => true,
    });
    assert.deepEqual(plan, { extraArgs: "--continue", resumed: false });
  });

  it("leaves unsupported tools untouched", () => {
    assert.equal(agentSessionSupported("codex"), false);
    const plan = planAgentSessionLaunch({
      ...base,
      tool: "codex",
      extraArgs: "--full-auto",
      transcriptExists: () => true,
    });
    assert.deepEqual(plan, { extraArgs: "--full-auto", resumed: false });
  });
});

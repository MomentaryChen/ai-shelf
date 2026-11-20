import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { encodeClaudeProjectDir } from "../shared/agent-session-resume.js";
import {
  forgetAgentSessionUsage,
  readAgentSessionUsage,
  trackAgentSessionUsage,
} from "./agent-session-usage.js";

const SESSION = "11111111-2222-4333-8444-555555555555";
const root = mkdtempSync(join(tmpdir(), "aishelf-usage-"));
after(() => rmSync(root, { recursive: true, force: true }));

function line(id: string, output: number): string {
  return `${JSON.stringify({
    type: "assistant",
    message: { id, model: "claude-opus-5-5", usage: { input_tokens: 0, output_tokens: output } },
  })}\n`;
}

function setup(name: string) {
  const configDir = join(root, name);
  const cwd = join(root, "work", name);
  const projectDir = join(configDir, "projects", encodeClaudeProjectDir(cwd));
  mkdirSync(projectDir, { recursive: true });
  const transcript = join(projectDir, `${SESSION}.jsonl`);
  trackAgentSessionUsage(name, { tool: "claude", agentSessionId: SESSION, configDir, cwd });
  return { transcript, projectDir };
}

describe("readAgentSessionUsage", () => {
  it("returns null for untracked panes and before the transcript exists", async () => {
    assert.equal(await readAgentSessionUsage("nope"), null);
    setup("empty");
    assert.equal(await readAgentSessionUsage("empty"), null);
  });

  it("reads appended lines incrementally and waits for a partial line to finish", async () => {
    const { transcript } = setup("incr");
    const second = line("msg_2", 20);
    writeFileSync(transcript, line("msg_1", 10) + second.slice(0, 15));
    assert.equal((await readAgentSessionUsage("incr"))?.outputTokens, 10);
    appendFileSync(transcript, second.slice(15) + line("msg_1", 10));
    const s = await readAgentSessionUsage("incr");
    assert.equal(s?.outputTokens, 30);
    assert.equal(s?.messages, 2);
  });

  it("includes sub-agent transcripts", async () => {
    const { transcript, projectDir } = setup("sub");
    writeFileSync(transcript, line("msg_main", 5));
    const subDir = join(projectDir, SESSION, "subagents");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "agent-a.jsonl"), line("msg_sub", 7));
    assert.equal((await readAgentSessionUsage("sub"))?.outputTokens, 12);
  });

  it("starts over when the transcript is rewritten shorter", async () => {
    const { transcript } = setup("rewrite");
    writeFileSync(transcript, line("msg_1", 10) + line("msg_2", 20));
    assert.equal((await readAgentSessionUsage("rewrite"))?.outputTokens, 30);
    writeFileSync(transcript, line("msg_3", 4));
    await readAgentSessionUsage("rewrite");
    assert.equal((await readAgentSessionUsage("rewrite"))?.outputTokens, 4);
  });

  it("forgets a pane", async () => {
    const { transcript } = setup("gone");
    writeFileSync(transcript, line("msg_1", 1));
    forgetAgentSessionUsage("gone");
    assert.equal(await readAgentSessionUsage("gone"), null);
  });
});

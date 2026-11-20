import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claudeModelPrice,
  extractClaudeConversation,
  summarizeClaudeTranscriptUsage,
} from "./claude-transcript-usage.js";

function assistant(id: string, model: string, usage: Record<string, number>, content: unknown) {
  return JSON.stringify({
    type: "assistant",
    message: { id, model, role: "assistant", usage, content },
  });
}

test("summarize: counts each message id once (Claude Code repeats usage per block)", () => {
  const usage = {
    input_tokens: 10,
    output_tokens: 100,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 2000,
  };
  const jsonl = [
    JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    assistant("m1", "claude-opus-5-5", usage, [{ type: "thinking", thinking: "" }]),
    assistant("m1", "claude-opus-5-5", usage, [{ type: "text", text: "hello" }]),
    assistant("m2", "claude-opus-5-5", { input_tokens: 5, output_tokens: 50 }, [
      { type: "text", text: "x" },
    ]),
    "{not json",
  ].join("\n");
  const u = summarizeClaudeTranscriptUsage(jsonl)!;
  assert.equal(u.messages, 2);
  assert.equal(u.inputTokens, 15);
  assert.equal(u.outputTokens, 150);
  assert.equal(u.cacheReadTokens, 1000);
  assert.equal(u.cacheWriteTokens, 2000);
  assert.equal(u.model, "claude-opus-5-5");
  // 15*4 + 150*20 + 1000*0.2 + 2000*4*1.25 = 60 + 3000 + 200 + 10000 = 13260 per 1M
  assert.equal(u.costUsd, 0.01326);
});

test("summarize: unknown model with tokens → no cost estimate", () => {
  const jsonl = assistant("m1", "some-other-model", { input_tokens: 5, output_tokens: 5 }, []);
  const u = summarizeClaudeTranscriptUsage(jsonl)!;
  assert.equal(u.costUsd, undefined);
  assert.equal(u.outputTokens, 5);
});

test("summarize: synthetic messages are skipped; empty → null", () => {
  assert.equal(summarizeClaudeTranscriptUsage(""), null);
  assert.equal(
    summarizeClaudeTranscriptUsage(assistant("m", "<synthetic>", { input_tokens: 0 }, [])),
    null,
  );
});

test("claudeModelPrice: prefixes, dated and provider ids", () => {
  assert.equal(claudeModelPrice("claude-opus-5-5")?.input, 4);
  assert.equal(claudeModelPrice("claude-opus-5")?.input, 5);
  assert.equal(claudeModelPrice("claude-sonnet-4-5-20250929")?.input, 3);
  assert.equal(claudeModelPrice("anthropic.claude-haiku-4-5")?.input, 1);
  assert.equal(claudeModelPrice("claude-opus-4-1-20250805")?.input, 15);
  assert.equal(claudeModelPrice("gpt-5"), null);
});

test("extractClaudeConversation: user + assistant text, joins blocks of one message", () => {
  const jsonl = [
    JSON.stringify({ type: "user", timestamp: "t1", message: { role: "user", content: "Do it" } }),
    JSON.stringify({
      type: "user",
      message: { role: "user", content: "<command-name>/x</command-name>" },
    }),
    assistant("m1", "claude-opus-5-5", {}, [{ type: "text", text: "Part 1" }]),
    assistant("m1", "claude-opus-5-5", {}, [
      { type: "tool_use", id: "t", name: "Bash", input: {} },
    ]),
    assistant("m1", "claude-opus-5-5", {}, [{ type: "text", text: "Part 2" }]),
    JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", content: "ok" }] },
    }),
    JSON.stringify({
      type: "assistant",
      isSidechain: true,
      message: { id: "s", content: [{ type: "text", text: "sub" }] },
    }),
    assistant("m2", "claude-opus-5-5", {}, [{ type: "text", text: "Done" }]),
  ].join("\n");
  assert.deepEqual(extractClaudeConversation(jsonl), [
    { role: "user", text: "Do it", timestamp: "t1" },
    { role: "assistant", text: "Part 1\n\nPart 2" },
    { role: "assistant", text: "Done" },
  ]);
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completeLinesLength,
  createClaudeUsageAccumulator,
  parseClaudeUsageLine,
} from "./claude-session-usage.js";

/** Synthetic transcript line in Claude Code's shape. */
function assistantLine(opts: {
  id?: string;
  requestId?: string;
  model?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  block?: string;
  iterations?: Record<string, unknown>[];
}): string {
  const usage: Record<string, unknown> = {
    input_tokens: opts.input ?? 0,
    output_tokens: opts.output ?? 0,
    cache_read_input_tokens: opts.cacheRead ?? 0,
    cache_creation_input_tokens: opts.cacheWrite ?? 0,
  };
  if (opts.cacheWrite1h != null) {
    usage.cache_creation = {
      ephemeral_5m_input_tokens: (opts.cacheWrite ?? 0) - opts.cacheWrite1h,
      ephemeral_1h_input_tokens: opts.cacheWrite1h,
    };
  }
  if (opts.iterations) usage.iterations = opts.iterations;
  return JSON.stringify({
    type: "assistant",
    requestId: opts.requestId,
    message: {
      id: opts.id,
      model: opts.model ?? "claude-opus-5-5",
      role: "assistant",
      content: [{ type: "text", text: opts.block ?? "hi" }],
      usage,
    },
  });
}

const userLine = JSON.stringify({ type: "user", message: { role: "user", content: "hello" } });

describe("parseClaudeUsageLine", () => {
  it("splits cache writes into 5m and 1h", () => {
    const parsed = parseClaudeUsageLine(
      assistantLine({ id: "msg_1", cacheWrite: 300, cacheWrite1h: 200 }),
    )[0];
    assert.equal(parsed?.entry.cacheWrite5mTokens, 100);
    assert.equal(parsed?.entry.cacheWrite1hTokens, 200);
  });

  it("treats cache writes without a TTL breakdown as 5m", () => {
    const [parsed] = parseClaudeUsageLine(assistantLine({ id: "msg_1", cacheWrite: 300 }));
    assert.equal(parsed?.entry.cacheWrite5mTokens, 300);
    assert.equal(parsed?.entry.cacheWrite1hTokens, 0);
  });

  it("falls back to requestId when the message has no id", () => {
    assert.equal(
      parseClaudeUsageLine(assistantLine({ requestId: "req_9", input: 1 }))[0]?.key,
      "req_9",
    );
  });

  it("ignores user lines, synthetic messages and broken JSON", () => {
    assert.deepEqual(parseClaudeUsageLine(userLine), []);
    assert.deepEqual(parseClaudeUsageLine(assistantLine({ id: "x", model: "<synthetic>" })), []);
    assert.deepEqual(parseClaudeUsageLine('{"type":"assistant","message":{"usage":'), []);
  });

  it("adds sub-calls on another model (advisor) as extra entries", () => {
    const parsed = parseClaudeUsageLine(
      assistantLine({
        id: "msg_1",
        output: 100,
        iterations: [
          { type: "message", output_tokens: 60 },
          {
            type: "advisor_message",
            model: "claude-fable-5-2",
            input_tokens: 1000,
            output_tokens: 50,
          },
          { type: "message", output_tokens: 40 },
        ],
      }),
    );
    assert.deepEqual(
      parsed.map((p) => [p.key, p.entry.model, p.entry.outputTokens]),
      [
        ["msg_1", "claude-opus-5-5", 100],
        ["msg_1#1", "claude-fable-5-2", 50],
      ],
    );
  });
});

describe("createClaudeUsageAccumulator", () => {
  it("counts a response written as several lines once", () => {
    const acc = createClaudeUsageAccumulator();
    acc.addText(
      [
        userLine,
        assistantLine({ id: "msg_1", input: 10, output: 5, cacheRead: 100, block: "thinking" }),
        assistantLine({ id: "msg_1", input: 10, output: 5, cacheRead: 100, block: "text" }),
        assistantLine({ id: "msg_1", input: 10, output: 5, cacheRead: 100, block: "tool_use" }),
        assistantLine({ id: "msg_2", input: 1, output: 2, cacheWrite: 50 }),
      ].join("\n"),
    );
    const s = acc.summary();
    assert.equal(s.messages, 2);
    assert.equal(s.inputTokens, 11);
    assert.equal(s.outputTokens, 7);
    assert.equal(s.cacheReadTokens, 100);
    assert.equal(s.cacheWriteTokens, 50);
    assert.equal(s.totalTokens, 168);
  });

  it("keeps the latest usage for a repeated id across chunks", () => {
    const acc = createClaudeUsageAccumulator();
    acc.addText(`${assistantLine({ id: "msg_1", output: 1 })}\n`);
    acc.addText(`${assistantLine({ id: "msg_1", output: 40 })}\n`);
    assert.equal(acc.summary().outputTokens, 40);
    assert.equal(acc.summary().messages, 1);
  });

  it("prices each response with its own model", () => {
    const acc = createClaudeUsageAccumulator();
    acc.addText(
      [
        assistantLine({ id: "a", model: "claude-opus-5-5", output: 1_000_000 }),
        assistantLine({ id: "b", model: "claude-sonnet-5-5", output: 1_000_000 }),
      ].join("\n"),
    );
    const s = acc.summary();
    assert.ok(s.costUsd != null && Math.abs(s.costUsd - 30) < 1e-9);
    assert.equal(s.costComplete, true);
    assert.deepEqual(s.models, ["claude-sonnet-5-5", "claude-opus-5-5"]);
  });

  it("prices advisor sub-calls with their own model", () => {
    const acc = createClaudeUsageAccumulator();
    const line = assistantLine({
      id: "a",
      output: 1_000_000,
      iterations: [
        { type: "message", output_tokens: 1_000_000 },
        { type: "advisor_message", model: "claude-fable-5-2", output_tokens: 1_000_000 },
      ],
    });
    // The same response written twice still counts once.
    acc.addText(`${line}
${line}`);
    const s = acc.summary();
    assert.equal(s.outputTokens, 2_000_000);
    assert.ok(s.costUsd != null && Math.abs(s.costUsd - (20 + 40)) < 1e-9);
  });

  it("marks the cost partial when a model has no price", () => {
    const acc = createClaudeUsageAccumulator();
    acc.addText(
      [
        assistantLine({ id: "a", model: "claude-opus-5-5", output: 1_000_000 }),
        assistantLine({ id: "b", model: "claude-opus-9", output: 1_000_000 }),
      ].join("\n"),
    );
    const s = acc.summary();
    assert.equal(s.costUsd, 20);
    assert.equal(s.costComplete, false);
  });

  it("reports no cost when nothing can be priced", () => {
    const acc = createClaudeUsageAccumulator();
    acc.addText(assistantLine({ id: "a", model: "claude-opus-9", output: 5 }));
    assert.equal(acc.summary().costUsd, null);
    assert.equal(acc.summary().totalTokens, 5);
  });
});

describe("completeLinesLength", () => {
  it("stops after the last newline", () => {
    const buf = new TextEncoder().encode("a\nbc\nde");
    assert.equal(completeLinesLength(buf), 5);
  });

  it("returns 0 when no line is complete", () => {
    assert.equal(completeLinesLength(new TextEncoder().encode("partial")), 0);
  });

  it("never splits a multi-byte character", () => {
    const buf = new TextEncoder().encode("中文\n中");
    const end = completeLinesLength(buf);
    assert.equal(new TextDecoder().decode(buf.subarray(0, end)), "中文\n");
  });
});

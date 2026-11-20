import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claudeMessageCostUsd, claudeRates, parseClaudeModel } from "./claude-pricing.js";

const close = (a: number | null, b: number) => {
  assert.ok(a != null, "expected a price");
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
};

const usage = (p: Partial<Parameters<typeof claudeMessageCostUsd>[1]>) => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  ...p,
});

describe("parseClaudeModel", () => {
  it("reads family and version from current and dated ids", () => {
    assert.deepEqual(parseClaudeModel("claude-opus-5-5"), { family: "opus", version: "5.5" });
    assert.deepEqual(parseClaudeModel("claude-opus-5"), { family: "opus", version: "5" });
    assert.deepEqual(parseClaudeModel("claude-haiku-4-5-20251001"), {
      family: "haiku",
      version: "4.5",
    });
    assert.deepEqual(parseClaudeModel("claude-opus-4-20250514"), { family: "opus", version: "4" });
  });

  it("tolerates provider prefixes and tags", () => {
    assert.deepEqual(parseClaudeModel("us.anthropic.claude-sonnet-5-5"), {
      family: "sonnet",
      version: "5.5",
    });
    assert.deepEqual(parseClaudeModel("claude-opus-5-5[1m]"), { family: "opus", version: "5.5" });
  });

  it("rejects non-Claude ids", () => {
    assert.equal(parseClaudeModel("<synthetic>"), null);
    assert.equal(parseClaudeModel("gpt-5"), null);
  });
});

describe("claudeRates", () => {
  it("prices by generation, not just family", () => {
    assert.equal(claudeRates("claude-opus-5-5")?.input, 4);
    assert.equal(claudeRates("claude-opus-5")?.input, 5);
    assert.equal(claudeRates("claude-sonnet-5-5")?.output, 10);
    assert.equal(claudeRates("claude-sonnet-4-6")?.output, 15);
  });

  it("uses model-specific cache read prices, else 0.1x input", () => {
    assert.equal(claudeRates("claude-opus-5-5")?.cacheRead, 0.2);
    assert.equal(claudeRates("claude-fable-5-1")?.cacheRead, 0.25);
    close(claudeRates("claude-opus-4-8")?.cacheRead ?? null, 0.5);
  });

  it("derives cache writes as 1.25x (5m) and 2x (1h) input", () => {
    const r = claudeRates("claude-opus-5-5");
    assert.equal(r?.cacheWrite5m, 5);
    assert.equal(r?.cacheWrite1h, 8);
  });

  it("applies Haiku 5.5's long-prompt tier above 100K prompt tokens", () => {
    assert.equal(claudeRates("claude-haiku-5-5", 50_000)?.input, 0.1);
    assert.equal(claudeRates("claude-haiku-5-5", 150_000)?.input, 0.5);
    assert.equal(claudeRates("claude-haiku-5-5", 150_000)?.output, 2.5);
  });

  it("returns null for unknown models", () => {
    assert.equal(claudeRates("claude-opus-9-9"), null);
    assert.equal(claudeRates("claude-3-5-sonnet-20241022"), null);
  });
});

describe("claudeMessageCostUsd", () => {
  it("sums every token class at its rate", () => {
    // Opus 5.5: 4 in / 20 out / 0.2 read / 5 write-5m / 8 write-1h per MTok.
    const cost = claudeMessageCostUsd(
      "claude-opus-5-5",
      usage({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWrite5mTokens: 1_000_000,
        cacheWrite1hTokens: 1_000_000,
      }),
    );
    close(cost, 4 + 20 + 0.2 + 5 + 8);
  });

  it("doubles fast-mode responses", () => {
    close(
      claudeMessageCostUsd("claude-opus-5-5", usage({ outputTokens: 1_000_000, fast: true })),
      40,
    );
  });

  it("returns null when the model has no price", () => {
    assert.equal(claudeMessageCostUsd("claude-unknown", usage({ inputTokens: 10 })), null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCompactTokens, formatSessionCost } from "./session-usage-format.js";

describe("formatCompactTokens", () => {
  it("scales to k and M", () => {
    assert.equal(formatCompactTokens(950), "950");
    assert.equal(formatCompactTokens(12_340), "12.3k");
    assert.equal(formatCompactTokens(456_000), "456k");
    assert.equal(formatCompactTokens(1_234_567), "1.23M");
    assert.equal(formatCompactTokens(250_000_000), "250M");
  });
});

describe("formatSessionCost", () => {
  it("shows cents, a floor for tiny amounts, and whole dollars when large", () => {
    assert.equal(formatSessionCost(0.004), "<$0.01");
    assert.equal(formatSessionCost(0.42), "$0.42");
    assert.equal(formatSessionCost(12.3), "$12.30");
    assert.equal(formatSessionCost(123.4), "$123");
  });
});

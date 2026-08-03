import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCronParts, previewCron, validateCronExpression } from "./cron-tools.js";

describe("cron-tools", () => {
  it("parses five fields", () => {
    assert.deepEqual(parseCronParts("0 9 * * 1-5"), {
      minute: "0",
      hour: "9",
      dayOfMonth: "*",
      month: "*",
      dayOfWeek: "1-5",
    });
  });

  it("rejects wrong field counts", () => {
    assert.equal(parseCronParts("* * *"), null);
    assert.equal(validateCronExpression("* * *", "UTC"), "fields");
  });

  it("previews next weekday 09:00 runs", () => {
    const from = new Date("2024-01-01T00:00:00.000Z"); // Monday
    const result = previewCron("0 9 * * 1-5", "UTC", 3, from);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.nextRuns.length, 3);
    assert.equal(result.nextRuns[0]!.toISOString(), "2024-01-01T09:00:00.000Z");
    assert.equal(result.nextRuns[1]!.toISOString(), "2024-01-02T09:00:00.000Z");
    assert.equal(result.nextRuns[2]!.toISOString(), "2024-01-03T09:00:00.000Z");
  });

  it("flags invalid timezone", () => {
    const result = previewCron("0 9 * * *", "Not/A_Zone", 1);
    assert.deepEqual(result, { ok: false, error: "timezone" });
  });
});

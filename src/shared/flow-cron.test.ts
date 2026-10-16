import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRunFlowNow } from "./flow-cron.js";

const DAILY_9 = "0 9 * * *";
const TZ = "UTC";

describe("shouldRunFlowNow", () => {
  it("fires on the exact cron minute", () => {
    const r = shouldRunFlowNow(DAILY_9, TZ, null, new Date("2026-05-02T09:00:30.000Z"));
    assert.deepEqual(r, { due: true, slotKey: "2026-05-02T09:00" });
  });

  it("does not re-fire a claimed slot", () => {
    const r = shouldRunFlowNow(DAILY_9, TZ, "2026-05-02T09:00", new Date("2026-05-02T09:00:30.000Z"));
    assert.equal(r.due, false);
  });

  it("catches up the latest missed slot", () => {
    const r = shouldRunFlowNow(DAILY_9, TZ, "2026-05-01T09:00", new Date("2026-05-02T13:15:00.000Z"));
    assert.deepEqual(r, { due: true, slotKey: "2026-05-02T09:00" });
  });

  it("does not catch up when the flow has never fired", () => {
    const r = shouldRunFlowNow(DAILY_9, TZ, null, new Date("2026-05-02T13:15:00.000Z"));
    assert.equal(r.due, false);
  });

  it("does not catch up after the slot already ran", () => {
    const r = shouldRunFlowNow(DAILY_9, TZ, "2026-05-02T09:00", new Date("2026-05-02T13:15:00.000Z"));
    assert.equal(r.due, false);
  });

  it("skips slots older than the catch-up window", () => {
    const r = shouldRunFlowNow("0 9 * * 1", TZ, "2026-04-20T09:00", new Date("2026-04-29T10:00:00.000Z"));
    assert.equal(r.due, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { watchDevicePixelRatio } from "./dpr-watch.js";

function fakeWindow(dpr: number) {
  const lists: { query: string; listeners: Set<() => void> }[] = [];
  const win = {
    devicePixelRatio: dpr,
    matchMedia(query: string) {
      const entry = { query, listeners: new Set<() => void>() };
      lists.push(entry);
      return {
        addEventListener: (_type: "change", l: () => void) => entry.listeners.add(l),
        removeEventListener: (_type: "change", l: () => void) => entry.listeners.delete(l),
      };
    },
  };
  const moveTo = (next: number) => {
    win.devicePixelRatio = next;
    for (const entry of [...lists]) for (const l of [...entry.listeners]) l();
  };
  const active = () => lists.filter((e) => e.listeners.size > 0).map((e) => e.query);
  return { win, moveTo, active };
}

describe("watchDevicePixelRatio", () => {
  it("reports each DPR change and re-queries for the new DPR", () => {
    const { win, moveTo, active } = fakeWindow(1);
    const seen: number[] = [];
    watchDevicePixelRatio(win, (dpr) => seen.push(dpr));
    assert.deepEqual(active(), ["(resolution: 1dppx)"]);

    moveTo(1.5);
    assert.deepEqual(seen, [1.5]);
    assert.deepEqual(active(), ["(resolution: 1.5dppx)"]);

    moveTo(1);
    assert.deepEqual(seen, [1.5, 1]);
    assert.deepEqual(active(), ["(resolution: 1dppx)"]);
  });

  it("does not report a change event when DPR is the same", () => {
    const { win, moveTo } = fakeWindow(2);
    const seen: number[] = [];
    watchDevicePixelRatio(win, (dpr) => seen.push(dpr));
    moveTo(2);
    assert.deepEqual(seen, []);
  });

  it("detaches from the current query on dispose, not only the first", () => {
    const { win, moveTo, active } = fakeWindow(1);
    const seen: number[] = [];
    const stop = watchDevicePixelRatio(win, (dpr) => seen.push(dpr));
    moveTo(1.25);
    stop();
    assert.deepEqual(active(), []);
    moveTo(2);
    assert.deepEqual(seen, [1.25]);
  });
});

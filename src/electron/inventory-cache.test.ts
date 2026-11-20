import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProviderEntry } from "../inventory/types.js";
import { createInventoryCache, type InventoryDetector } from "./inventory-cache.js";

function entry(tool: string): ProviderEntry {
  return { tool, provider: tool, available: true } as ProviderEntry;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("inventory-cache", () => {
  it("shares one scan between concurrent callers and caches the result", async () => {
    let runs = 0;
    const gate = deferred<ProviderEntry>();
    const detectors: InventoryDetector[] = [() => {
      runs += 1;
      return gate.promise;
    }];
    const cache = createInventoryCache(() => detectors, 30_000);
    const a = cache.load();
    const b = cache.scan();
    gate.resolve(entry("claude"));
    assert.deepEqual(await a, await b);
    assert.equal(runs, 1);
    assert.equal(cache.get()?.length, 1);
    await cache.load();
    assert.equal(runs, 1);
  });

  it("replays entries found before a streaming caller joined", async () => {
    const slow = deferred<ProviderEntry>();
    const detectors: InventoryDetector[] = [
      () => Promise.resolve(entry("codex")),
      () => slow.promise,
    ];
    const cache = createInventoryCache(() => detectors, 30_000);
    const first = cache.scan();
    await new Promise((r) => setImmediate(r));
    const seen: string[] = [];
    const joined = cache.scan((e) => seen.push(e.tool));
    assert.deepEqual(seen, ["codex"]);
    slow.resolve(entry("gemini"));
    await Promise.all([first, joined]);
    assert.deepEqual(seen.sort(), ["codex", "gemini"]);
  });

  it("skips failed detectors", async () => {
    const detectors: InventoryDetector[] = [
      () => Promise.reject(new Error("boom")),
      () => Promise.resolve(entry("aider")),
    ];
    const cache = createInventoryCache(() => detectors, 30_000);
    const entries = await cache.scan();
    assert.deepEqual(entries.map((e) => e.tool), ["aider"]);
  });

  it("does not cache a scan that was invalidated mid-flight", async () => {
    const gate = deferred<ProviderEntry>();
    let runs = 0;
    const detectors: InventoryDetector[] = [() => {
      runs += 1;
      return runs === 1 ? gate.promise : Promise.resolve(entry("fresh"));
    }];
    const cache = createInventoryCache(() => detectors, 30_000);
    const stale = cache.scan();
    cache.invalidate();
    const fresh = await cache.scan();
    assert.deepEqual(fresh.map((e) => e.tool), ["fresh"]);
    gate.resolve(entry("stale"));
    await stale;
    assert.deepEqual(cache.get()?.map((e) => e.tool), ["fresh"]);
  });

  it("expires after the TTL", async () => {
    let t = 0;
    let runs = 0;
    const detectors: InventoryDetector[] = [() => {
      runs += 1;
      return Promise.resolve(entry("claude"));
    }];
    const cache = createInventoryCache(() => detectors, 1000, () => t);
    await cache.load();
    t = 999;
    await cache.load();
    assert.equal(runs, 1);
    t = 1000;
    assert.equal(cache.get(), null);
    await cache.load();
    assert.equal(runs, 2);
  });
});

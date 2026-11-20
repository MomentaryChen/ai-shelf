/**
 * Inventory detection is slow (each detector spawns CLIs), so the main process
 * keeps a short-lived cache and lets concurrent callers share one scan.
 * Electron-free so it can be unit tested.
 */
import type { ProviderEntry } from "../inventory/types.js";
import { sortProviderEntries } from "../tool-sort.js";

export type InventoryDetector = () => Promise<ProviderEntry>;

type SharedScan = {
  /** Entries found so far, in arrival order (replayed to late joiners). */
  found: ProviderEntry[];
  listeners: Set<(entry: ProviderEntry) => void>;
  promise: Promise<ProviderEntry[]>;
};

export type InventoryCache = {
  /** Cached entries while fresh, else null. */
  get(): ProviderEntry[] | null;
  set(entries: ProviderEntry[]): void;
  /** Drop the cache and detach any scan in flight (its result is not cached). */
  invalidate(): void;
  /**
   * Run a full detection, or join the one already running. `onEntry` sees
   * every entry of that scan, including ones found before joining.
   */
  scan(onEntry?: (entry: ProviderEntry) => void): Promise<ProviderEntry[]>;
  /** Cached entries when fresh, otherwise `scan()`. */
  load(): Promise<ProviderEntry[]>;
};

function notify(cb: (entry: ProviderEntry) => void, entry: ProviderEntry): void {
  try {
    cb(entry);
  } catch {
    /* a listener must not break the scan */
  }
}

export function createInventoryCache(
  detectors: () => readonly InventoryDetector[],
  ttlMs: number,
  now: () => number = Date.now,
): InventoryCache {
  let cache: { at: number; entries: ProviderEntry[] } | null = null;
  let current: SharedScan | null = null;
  let generation = 0;

  const get = () => (cache && now() - cache.at < ttlMs ? cache.entries : null);
  const set = (entries: ProviderEntry[]) => {
    cache = { at: now(), entries };
  };

  function start(): SharedScan {
    const gen = generation;
    const shared: SharedScan = {
      found: [],
      listeners: new Set(),
      promise: Promise.resolve([]),
    };
    shared.promise = Promise.all(
      detectors().map(async (detect) => {
        try {
          const entry = await detect();
          shared.found.push(entry);
          for (const cb of [...shared.listeners]) notify(cb, entry);
        } catch {
          /* skip failed detectors (same as detectAll) */
        }
      }),
    ).then(() => {
      const entries = sortProviderEntries([...shared.found]);
      if (gen === generation) set(entries);
      return entries;
    }).finally(() => {
      shared.listeners.clear();
      if (current === shared) current = null;
    });
    return shared;
  }

  function scan(onEntry?: (entry: ProviderEntry) => void): Promise<ProviderEntry[]> {
    if (!current) current = start();
    const shared = current;
    if (onEntry) {
      for (const entry of shared.found) notify(onEntry, entry);
      shared.listeners.add(onEntry);
    }
    return shared.promise;
  }

  return {
    get,
    set,
    invalidate() {
      cache = null;
      current = null;
      generation += 1;
    },
    scan,
    async load() {
      return get() ?? scan();
    },
  };
}

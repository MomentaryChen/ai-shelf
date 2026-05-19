import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderEntry } from "../types";
import { sortProviderEntries } from "../../tool-sort.js";

function mergeEntry(list: ProviderEntry[], entry: ProviderEntry): ProviderEntry[] {
  const i = list.findIndex((e) => e.tool === entry.tool);
  if (i >= 0) {
    const next = [...list];
    next[i] = entry;
    return sortProviderEntries(next);
  }
  return sortProviderEntries([...list, entry]);
}

export function useInventoryScan() {
  const [data, setData] = useState<ProviderEntry[]>([]);
  const [scanning, setScanning] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState(false);
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
  const abortRef = useRef(false);
  const enrichPendingRef = useRef(0);

  const reload = useCallback(() => {
    abortRef.current = false;
    setData([]);
    setScanning(true);
    setEnriching(false);
    setError(false);
    setModelOverrides({});
    enrichPendingRef.current = 0;

    window.api.offInventoryListeners();
    window.api.clearInventoryCache();

    window.api.onInventoryEntry((entry) => {
      if (abortRef.current) return;
      setData((prev) => mergeEntry(prev, entry));
    });

    window.api.onInventoryEnriched((entry) => {
      if (abortRef.current) return;
      setData((prev) => mergeEntry(prev, entry));
      enrichPendingRef.current -= 1;
      if (enrichPendingRef.current <= 0) setEnriching(false);
    });

    window.api.onInventoryComplete(({ count }) => {
      if (abortRef.current) return;
      setScanning(false);
      enrichPendingRef.current = count;
      setEnriching(count > 0);
    });

    window.api.startInventoryScan().catch(() => {
      if (!abortRef.current) setError(true);
    });
  }, []);

  useEffect(() => {
    reload();
    return () => {
      abortRef.current = true;
      window.api.offInventoryListeners();
    };
  }, [reload]);

  const hasData = data.length > 0;
  const ready = hasData || error;

  return {
    data,
    scanning,
    enriching,
    error,
    hasData,
    ready,
    modelOverrides,
    setModelOverrides,
    reload,
  };
}

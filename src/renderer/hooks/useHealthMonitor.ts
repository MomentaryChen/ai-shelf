import { useCallback, useEffect, useState } from "react";
import type { HealthMonitorState } from "../types";

export function useHealthMonitor() {
  const [state, setState] = useState<HealthMonitorState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.getHealthMonitorState().then((s) => {
      if (!cancelled) setState(s);
    });
    const unsub = window.api.onHealthMonitorState((next) => setState(next));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const refresh = useCallback(() => {
    void window.api.runHealthCheck().then(setState);
  }, []);

  const setPrefs = useCallback(async (partial: Partial<HealthMonitorState["prefs"]>) => {
    const res = await window.api.setHealthMonitorPrefs(partial);
    if (res.ok) {
      setState((prev) => (prev ? { ...prev, prefs: res.prefs } : prev));
    }
    return res.prefs;
  }, []);

  return { state, refresh, setPrefs };
}

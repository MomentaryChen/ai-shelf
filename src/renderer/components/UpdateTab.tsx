import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolUpdateInfo } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { toolIcon } from "../utils";

export function UpdateTab() {
  const [tools, setTools] = useState<ToolUpdateInfo[]>([]);
  const [checkingLatest, setCheckingLatest] = useState<Set<string>>(new Set());
  const [scanDone, setScanDone] = useState(false);
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const abortRef = useRef(false);

  const startScan = useCallback(() => {
    abortRef.current = false;
    setTools([]);
    setCheckingLatest(new Set());
    setScanDone(false);
    setResults({});

    window.api.offScanListeners();

    window.api.onToolDetected((data) => {
      if (abortRef.current) return;
      setTools((prev) => {
        const exists = prev.find((t) => t.tool === data.tool);
        return exists
          ? prev.map((t) => (t.tool === data.tool ? { ...t, ...data } : t))
          : [...prev, data];
      });
      setCheckingLatest((prev) => new Set([...prev, data.tool]));
    });

    window.api.onToolLatest(({ tool, latestVersion }) => {
      if (abortRef.current) return;
      setTools((prev) => prev.map((t) => (t.tool === tool ? { ...t, latestVersion } : t)));
      setCheckingLatest((prev) => { const n = new Set(prev); n.delete(tool); return n; });
    });

    window.api.onScanComplete(() => {
      if (!abortRef.current) setScanDone(true);
    });

    window.api.startUpdateScan();
  }, []);

  useEffect(() => {
    startScan();
    return () => {
      abortRef.current = true;
      window.api.offScanListeners();
    };
  }, [startScan]);

  const handleUpdate = async (tool: string) => {
    setUpdating((prev) => ({ ...prev, [tool]: true }));
    setResults((prev) => { const n = { ...prev }; delete n[tool]; return n; });
    try {
      const res = await window.api.runUpdate(tool);
      setResults((prev) => ({ ...prev, [tool]: res }));
      if (res.success) startScan();
    } catch {
      setResults((prev) => ({ ...prev, [tool]: { success: false, message: "Update failed unexpectedly" } }));
    } finally {
      setUpdating((prev) => ({ ...prev, [tool]: false }));
    }
  };

  const selfTool = tools.find((t) => t.tool === "ai-cli-inventory");
  const aiTools = tools.filter((t) => t.tool !== "ai-cli-inventory");
  const isScanning = !scanDone || checkingLatest.size > 0;

  const outdatedTools = tools.filter(
    (t) => t.latestVersion != null && t.latestVersion !== t.currentVersion
  );
  const allUpToDate = !isScanning && tools.length > 0 && outdatedTools.length === 0;
  const hasUpdates = !isScanning && outdatedTools.length > 0;

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        🔄 Update
        {isScanning && (
          <span className="animate-pulse text-sm font-normal text-text-secondary">scanning…</span>
        )}
      </h2>

      <div className="mb-3 flex justify-end">
        <button
          onClick={startScan}
          disabled={isScanning}
          className="cursor-pointer rounded-lg border border-border bg-bg-card px-4 py-2 text-sm text-text-primary transition-all hover:border-accent disabled:opacity-50"
        >
          🔍 Re-check All
        </button>
      </div>

      {tools.length === 0 && (
        <p className="py-10 text-center animate-pulse text-text-secondary">Detecting tools…</p>
      )}

      {allUpToDate && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/10 px-4 py-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="font-semibold text-ok">所有工具均為最新版本</p>
            <p className="text-xs text-text-secondary">共 {tools.length} 個工具，無需更新</p>
          </div>
        </div>
      )}

      {hasUpdates && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
          <span className="text-2xl">⬆️</span>
          <div>
            <p className="font-semibold text-warn">有 {outdatedTools.length} 個工具可更新</p>
            <p className="text-xs text-text-secondary">請展開下方卡片進行更新</p>
          </div>
        </div>
      )}

      {aiTools.map((t) => (
        <ToolUpdateCard
          key={t.tool}
          tool={t}
          isChecking={checkingLatest.has(t.tool)}
          isUpdating={updating[t.tool] ?? false}
          result={results[t.tool]}
          onUpdate={() => handleUpdate(t.tool)}
        />
      ))}

      {selfTool && (
        <ToolUpdateCard
          key={selfTool.tool}
          tool={selfTool}
          isChecking={checkingLatest.has(selfTool.tool)}
          isUpdating={updating[selfTool.tool] ?? false}
          result={results[selfTool.tool]}
          onUpdate={() => handleUpdate(selfTool.tool)}
        />
      )}
    </>
  );
}

function ToolUpdateCard({
  tool: t,
  isChecking,
  isUpdating,
  result,
  onUpdate,
}: {
  tool: ToolUpdateInfo;
  isChecking: boolean;
  isUpdating: boolean;
  result?: { success: boolean; message: string };
  onUpdate: () => void;
}) {
  const icon = toolIcon(t.tool === "ai-cli-inventory" ? "" : t.tool);
  const isOutdated = t.latestVersion != null && t.currentVersion != null && t.latestVersion !== t.currentVersion;
  const isUpToDate = t.latestVersion != null && t.currentVersion != null && t.latestVersion === t.currentVersion;

  const badge = isChecking
    ? <Badge text="Checking…" variant="info" />
    : !t.available
      ? <Badge text="Not Installed" variant="fail" />
      : isOutdated
        ? <Badge text="Update Available" variant="warn" />
        : isUpToDate
          ? <Badge text="Up to Date" variant="ok" />
          : <Badge text="Installed" variant="info" />;

  return (
    <Card title={<>{icon} {t.label}</>} trailing={badge}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {isOutdated ? (
            <>
              <span className="rounded bg-bg-primary/60 px-2 py-0.5 font-mono font-semibold text-fail">
                v{t.currentVersion}
              </span>
              <span className="text-base text-text-secondary">→</span>
              <span className="rounded bg-bg-primary/60 px-2 py-0.5 font-mono font-semibold text-ok">
                v{t.latestVersion}
              </span>
            </>
          ) : (
            <>
              <span className="text-text-secondary">Version:</span>
              <span className={`font-mono font-semibold ${isUpToDate ? "text-ok" : "text-text-primary"}`}>
                {t.currentVersion ?? "—"}
              </span>
              {isUpToDate && <span className="text-ok">✓</span>}
              {isChecking && <span className="animate-pulse text-xs text-text-secondary">checking latest…</span>}
            </>
          )}
        </div>

        {t.updateCommand && (
          <div className="rounded bg-bg-primary/60 px-3 py-2 font-mono text-xs text-text-secondary">
            $ {t.updateCommand}
          </div>
        )}

        {t.available && t.updateCommand && (
          isUpToDate ? (
            <div className="flex items-center gap-2 text-sm text-ok">
              <span>✅</span>
              <span>無需更新，已是最新版本</span>
            </div>
          ) : isOutdated ? (
            <button
              onClick={onUpdate}
              disabled={isUpdating}
              className="cursor-pointer rounded-lg border border-accent bg-accent/15 px-4 py-2 text-sm font-semibold text-accent transition-all hover:bg-accent/25 disabled:opacity-50"
            >
              {isUpdating ? "⏳ Updating…" : "⬆️ Update"}
            </button>
          ) : null
        )}

        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.success ? "bg-ok/10 text-ok" : "bg-fail/10 text-fail"}`}>
            {result.success ? "✅" : "❌"} {result.message}
          </div>
        )}
      </div>
    </Card>
  );
}

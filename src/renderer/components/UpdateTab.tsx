import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProviderEntry, ToolUpdateInfo } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { toolIcon, toolLabel } from "../utils";
import { versionsEqual } from "../../utils/version.js";

type UpdateMeta = Record<string, { latestVersion: string | null; updateCommand: string }>;

export function UpdateTab({ data }: { data: ProviderEntry[] }) {
  const [meta, setMeta] = useState<UpdateMeta>({});
  const [selfTool, setSelfTool] = useState<ToolUpdateInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const runCheck = useCallback(async () => {
    setChecking(true);
    setResults({});
    try {
      const { tools } = await window.api.checkUpdate();
      const nextMeta: UpdateMeta = {};
      let self: ToolUpdateInfo | null = null;
      for (const t of tools) {
        if (t.tool === "ai-shelf") {
          self = t;
        } else {
          nextMeta[t.tool] = {
            latestVersion: t.latestVersion,
            updateCommand: t.updateCommand,
          };
        }
      }
      setMeta(nextMeta);
      setSelfTool(self);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck, data]);

  const tools = useMemo((): ToolUpdateInfo[] => {
    const fromInventory = data.map((e) => ({
      tool: e.tool,
      label: toolLabel(e.tool),
      currentVersion: e.version ?? null,
      latestVersion: meta[e.tool]?.latestVersion ?? null,
      available: e.available,
      updateCommand: meta[e.tool]?.updateCommand ?? "",
    }));
    return selfTool ? [...fromInventory, selfTool] : fromInventory;
  }, [data, meta, selfTool]);

  const handleUpdate = async (tool: string) => {
    setUpdating((prev) => ({ ...prev, [tool]: true }));
    setResults((prev) => {
      const n = { ...prev };
      delete n[tool];
      return n;
    });
    try {
      const res = await window.api.runUpdate(tool);
      setResults((prev) => ({ ...prev, [tool]: res }));
      if (res.success) await runCheck();
    } catch {
      setResults((prev) => ({
        ...prev,
        [tool]: { success: false, message: "Update failed unexpectedly" },
      }));
    } finally {
      setUpdating((prev) => ({ ...prev, [tool]: false }));
    }
  };

  const outdatedTools = tools.filter(
    (t) => t.latestVersion != null && !versionsEqual(t.currentVersion, t.latestVersion),
  );
  const allUpToDate = !checking && tools.length > 0 && outdatedTools.length === 0;
  const hasUpdates = !checking && outdatedTools.length > 0;

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        🔄 Update
        {checking && (
          <span className="animate-pulse text-sm font-normal text-text-secondary">checking…</span>
        )}
      </h2>

      <div className="mb-3 flex justify-end">
        <button
          onClick={() => void runCheck()}
          disabled={checking}
          className="cursor-pointer rounded-lg border border-border bg-bg-card px-4 py-2 text-sm text-text-primary transition-all hover:border-accent disabled:opacity-50"
        >
          🔍 Re-check All
        </button>
      </div>

      {!checking && tools.length === 0 && (
        <p className="py-10 text-center text-text-secondary">No tools detected</p>
      )}

      {allUpToDate && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/10 px-4 py-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="font-semibold text-ok">All tools are up to date</p>
            <p className="text-xs text-text-secondary">{tools.length} tools checked — nothing to update</p>
          </div>
        </div>
      )}

      {hasUpdates && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
          <span className="text-2xl">⬆️</span>
          <div>
            <p className="font-semibold text-warn">
              {outdatedTools.length} tool{outdatedTools.length === 1 ? "" : "s"} can be updated
            </p>
            <p className="text-xs text-text-secondary">Use the cards below to update</p>
          </div>
        </div>
      )}

      {tools.map((t) => (
        <ToolUpdateCard
          key={t.tool}
          tool={t}
          isChecking={checking && t.latestVersion == null}
          isUpdating={updating[t.tool] ?? false}
          result={results[t.tool]}
          onUpdate={() => void handleUpdate(t.tool)}
        />
      ))}
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
  const icon = toolIcon(t.tool === "ai-shelf" ? "" : t.tool);
  const isOutdated =
    t.latestVersion != null &&
    t.currentVersion != null &&
    !versionsEqual(t.currentVersion, t.latestVersion);
  const isUpToDate =
    t.latestVersion != null &&
    t.currentVersion != null &&
    versionsEqual(t.currentVersion, t.latestVersion);

  const badge = isChecking
    ? <Badge text="Checking…" variant="info" />
    : !t.available
      ? <Badge text="未安裝" variant="fail" />
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

        {t.desktopUpdate && !t.updateCommand && (
          <p className="text-xs text-text-secondary">
            Installed desktop app — updates download from GitHub Releases and install on restart.
          </p>
        )}

        {t.available && (t.updateCommand || t.desktopUpdate) && !isChecking && (
          isUpToDate ? (
            <div className="flex items-center gap-2 text-sm text-ok">
              <span>✅</span>
              <span>No update needed — already on the latest version</span>
            </div>
          ) : (
            <button
              onClick={onUpdate}
              disabled={isUpdating}
              className="cursor-pointer rounded-lg border border-accent bg-accent/15 px-4 py-2 text-sm font-semibold text-accent transition-all hover:bg-accent/25 disabled:opacity-50"
            >
              {isUpdating
                ? "⏳ Updating…"
                : t.desktopUpdate
                  ? "⬆️ Download & upgrade desktop"
                  : "⬆️ Update"}
            </button>
          )
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

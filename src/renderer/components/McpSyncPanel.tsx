import { useCallback, useEffect, useState } from "react";
import type { McpRawData, McpSyncResult } from "../types";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Button } from "./Button";

import { MCP_SYNC_TOOL_IDS } from "../../tools.js";
import { useLocale } from "../i18n/LocaleProvider";

const TOOLS = MCP_SYNC_TOOL_IDS;
const TOOL_ICONS: Record<string, string> = {
  claude: "🟣",
  copilot: "🐙",
  cursor: "📐",
  codex: "🤖",
  gemini: "✨",
  opencode: "◇",
};

export function McpSyncPanel() {
  const { t } = useLocale();
  const [rawData, setRawData] = useState<McpRawData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetTools, setTargetTools] = useState<Set<string>>(new Set(TOOLS));
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<McpSyncResult[] | null>(null);

  const load = useCallback(async () => {
    setResults(null);
    try {
      const data = await window.api.getMcpRaw();
      setRawData(data);
    } catch (err) {
      console.error("[McpSyncPanel] load error:", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!rawData) return null;

  const allServerNames = [
    ...new Set(TOOLS.flatMap((t) => Object.keys(rawData[t]?.servers ?? {})))
  ].sort();

  // Partition into syncable (has any missing) and fully synced
  const syncableServers = allServerNames.filter((s) =>
    TOOLS.some((t) => !rawData[t]?.servers?.[s])
  );
  const syncedCount = allServerNames.length - syncableServers.length;

  const allMissingSelected = syncableServers.length > 0 && selected.size === syncableServers.length;

  const toggleServer = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleTarget = (tool: string) =>
    setTargetTools((prev) => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });

  const doSync = async (serverNames: string[]) => {
    if (serverNames.length === 0 || targetTools.size === 0) return;
    setSyncing(true);
    setResults(null);
    try {
      const res = await window.api.syncMcp({ serverNames, targetTools: [...targetTools] });
      setResults(res);
      await load();
    } catch {
      setResults([{ tool: "all", added: [], skipped: [], error: "Sync failed" }]);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card title={`🔌 ${t("inventory.mcpSync.title")}`}>
      {/* Sync results */}
      {results && (
        <div className="mb-4 rounded-lg border border-border bg-bg-primary p-3">
          {results.map((r) => (
            <div key={r.tool} className="mb-1 text-sm">
              <strong>{TOOL_ICONS[r.tool] ?? "🔧"} {r.tool}</strong>:{" "}
              {r.error ? (
                <span className="text-fail">❌ {r.error}</span>
              ) : (
                <>
                  {r.added.length > 0 && (
                    <span className="text-ok">+{r.added.length} added ({r.added.join(", ")})</span>
                  )}
                  {r.added.length > 0 && r.skipped.length > 0 && " · "}
                  {r.skipped.length > 0 && (
                    <span className="text-text-secondary">{r.skipped.length} skipped</span>
                  )}
                  {r.added.length === 0 && r.skipped.length === 0 && (
                    <span className="text-text-secondary">{t("inventory.mcpSync.noChanges")}</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* All synced banner */}
      {syncableServers.length === 0 && allServerNames.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/10 px-4 py-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-ok">{t("inventory.mcpSync.allSynced")}</p>
            <p className="text-xs text-text-secondary">
              {t("inventory.mcpSync.serverCount", { count: allServerNames.length })}
            </p>
          </div>
        </div>
      )}

      {/* Controls row */}
      {syncableServers.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-bg-primary px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="font-semibold uppercase tracking-wider">{t("inventory.mcpSync.syncTo")}</span>
            {TOOLS.map((tool) => (
              <label key={tool} className="flex cursor-pointer items-center gap-1 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={targetTools.has(tool)}
                  onChange={() => toggleTarget(tool)}
                  className="accent-accent"
                />
                {TOOL_ICONS[tool]} {tool}
              </label>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => doSync([...selected])}
              disabled={syncing || selected.size === 0 || targetTools.size === 0}
            >
              {syncing ? "Syncing…" : `Sync Selected (${selected.size})`}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => doSync(syncableServers)}
              disabled={syncing || targetTools.size === 0}
            >
              {syncing ? "Syncing…" : `Sync All Missing (${syncableServers.length})`}
            </Button>
          </div>
        </div>
      )}

      {/* Unified matrix */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-border px-3 py-2 text-left">
                {syncableServers.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allMissingSelected}
                    onChange={() => setSelected(allMissingSelected ? new Set() : new Set(syncableServers))}
                    className="accent-accent"
                    title={t("inventory.mcpSync.selectMissing")}
                  />
                )}
              </th>
              <th className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Server
              </th>
              {TOOLS.map((t) => (
                <th key={t} className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  {TOOL_ICONS[t]} {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Syncable rows (has missing) — shown first */}
            {syncableServers.map((server) => (
              <tr key={server} className="bg-warn/5 hover:bg-warn/10 transition-colors">
                <td className="border-b border-border/40 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(server)}
                    onChange={() => toggleServer(server)}
                    className="accent-accent"
                  />
                </td>
                <td className="border-b border-border/40 px-3 py-2 font-medium">
                  🔌 {server}
                </td>
                {TOOLS.map((t) => (
                  <td key={t} className="border-b border-border/40 px-3 py-2">
                    {rawData[t]?.servers?.[server] ? "✅" : <Badge text="Missing" variant="warn" />}
                  </td>
                ))}
              </tr>
            ))}
            {/* Fully synced rows — dimmed */}
            {allServerNames
              .filter((s) => !syncableServers.includes(s))
              .map((server) => (
                <tr key={server} className="opacity-50">
                  <td className="border-b border-border/30 px-3 py-2">
                    <input type="checkbox" disabled className="cursor-not-allowed opacity-30" />
                  </td>
                  <td className="border-b border-border/30 px-3 py-2 font-medium">
                    🔌 {server}
                  </td>
                  {TOOLS.map((t) => (
                    <td key={t} className="border-b border-border/30 px-3 py-2">✅</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      <div className="mt-3 text-xs text-text-secondary">
        {allServerNames.length} servers total ·{" "}
        {syncableServers.length > 0
          ? <span className="text-warn">{syncableServers.length} need sync</span>
          : <span className="text-ok">{t("inventory.mcpSync.allSyncedShort")}</span>}
        {syncedCount > 0 && ` · ${syncedCount} fully synced`}
      </div>
    </Card>
  );
}

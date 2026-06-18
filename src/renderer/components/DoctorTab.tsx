import { useEffect, useState } from "react";
import type { DoctorResult, McpPingResult, ProviderEntry } from "../types";
import { Card } from "./Card";
import { Badge, InstallStatusBadge } from "./Badge";
import { Button } from "./Button";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";
import { canonicalToolId } from "../../tools.js";
import { useLocale } from "../i18n/LocaleProvider";

/** Live MCP connectivity test — runs a real `initialize` handshake per server. */
function McpConnectivity({ entry }: { entry: ProviderEntry }) {
  const { t } = useLocale();
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<McpPingResult[] | null>(null);

  if (!entry.mcp.supported) return null;

  const run = async () => {
    setTesting(true);
    try {
      const res = await window.api.mcpPingTool(canonicalToolId(entry.tool));
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          🔌 MCP
        </span>
        <Button size="sm" variant="secondary" onClick={run} disabled={testing}>
          {testing
            ? t("doctor.mcpTesting")
            : results
              ? t("doctor.mcpRetest")
              : t("doctor.mcpTest")}
        </Button>
      </div>

      {results && results.length === 0 && !testing && (
        <p className="mt-2 text-[13px] text-text-tertiary">{t("doctor.mcpNoServers")}</p>
      )}

      {results && results.length > 0 && (
        <>
          <div className="mt-2 flex flex-col gap-1">
            {results.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-[13px]">
                <span className="w-5 shrink-0 text-center">{r.ok ? "✅" : "❌"}</span>
                <span className="font-mono text-text-primary">{r.name}</span>
                <span className="rounded bg-bg-secondary px-1 text-[10px] uppercase text-text-tertiary">
                  {r.transport}
                </span>
                <span className="truncate text-text-secondary">
                  {r.ok
                    ? r.serverName
                      ? `${r.serverName}${r.serverVersion ? ` v${r.serverVersion}` : ""}`
                      : t("doctor.mcpReachable")
                    : r.error}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">{r.durationMs}ms</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-text-tertiary">{t("doctor.mcpEnabledOnly")}</p>
        </>
      )}
    </div>
  );
}

function DoctorCards({
  entries,
  results,
}: {
  entries: ProviderEntry[];
  results: Record<string, DoctorResult>;
}) {
  const { t } = useLocale();
  return entries.map((entry) => {
    const { tool, available } = entry;
    const r = results[tool];
    const passCount = r?.checks.filter((c) => c.status === "pass").length ?? 0;
    const total = r?.checks.length ?? 0;
    const allPass = r != null && passCount === total;

    return (
      <Card
        key={tool}
        collapsible
        defaultCollapsed
        className={installedCardClass(available)}
        title={<ToolNameCell entry={entry} />}
        trailing={
          !available ? (
            <InstallStatusBadge available={false} />
          ) : r ? (
            <Badge
              text={t("inventory.doctor.passed", { pass: passCount, total })}
              variant={allPass ? "ok" : "warn"}
            />
          ) : undefined
        }
      >
        {!available ? (
          <p className="text-[13px] text-text-tertiary">{t("inventory.skipDoctor")}</p>
        ) : !r ? (
          <div className="flex items-center gap-2 text-[13px] text-text-secondary">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
            {t("inventory.doctor.checking")}
          </div>
        ) : (
          <>
            {r.checks.map((c) => {
              const icon = c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : "⚠️";
              return (
                <div key={c.detail} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <span className="w-5 shrink-0 text-center">{icon}</span>
                  <span>{c.detail}</span>
                </div>
              );
            })}
            <McpConnectivity entry={entry} />
          </>
        )}
      </Card>
    );
  });
}

export function DoctorTab({ data }: { data: ProviderEntry[] }) {
  const { t } = useLocale();
  const [results, setResults] = useState<Record<string, DoctorResult>>({});
  const { installed, notInstalled } = partitionByInstalled(data);

  const installedIds = installed.map((e) => e.tool).join("\0");

  useEffect(() => {
    setResults({});
    let cancelled = false;
    void Promise.all(
      installed.map(async ({ tool }) => {
        try {
          const res = await window.api.runDoctorTool(tool);
          if (!cancelled) setResults((prev) => ({ ...prev, [tool]: res }));
        } catch {
          if (!cancelled) {
            setResults((prev) => ({
              ...prev,
              [tool]: { tool, checks: [{ name: "error", status: "fail", detail: "Check failed unexpectedly" }] },
            }));
          }
        }
      }),
    );
    return () => { cancelled = true; };
  }, [installedIds]);

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🩺 {t("app.tab.doctor")}</h2>

      <InventorySectionHeader count={installed.length} variant="installed" />
      <DoctorCards entries={installed} results={results} />

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <DoctorCards entries={notInstalled} results={results} />
    </>
  );
}

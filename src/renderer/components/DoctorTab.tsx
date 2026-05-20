import { useEffect, useState } from "react";
import type { DoctorResult, ProviderEntry } from "../types";
import { Card } from "./Card";
import { Badge, InstallStatusBadge } from "./Badge";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";

function DoctorCards({
  entries,
  results,
}: {
  entries: ProviderEntry[];
  results: Record<string, DoctorResult>;
}) {
  return entries.map((entry) => {
    const { tool, available } = entry;
    const r = results[tool];
    const passCount = r?.checks.filter((c) => c.status === "pass").length ?? 0;
    const total = r?.checks.length ?? 0;
    const allPass = r != null && passCount === total;

    return (
      <Card
        key={tool}
        className={installedCardClass(available)}
        title={<ToolNameCell entry={entry} />}
        trailing={
          !available ? (
            <InstallStatusBadge available={false} />
          ) : r ? (
            <Badge
              text={`${passCount}/${total} passed`}
              variant={allPass ? "ok" : "warn"}
            />
          ) : undefined
        }
      >
        {!available ? (
          <p className="text-[13px] text-text-tertiary">未安裝，已略過健康檢查</p>
        ) : !r ? (
          <div className="flex items-center gap-2 text-[13px] text-text-secondary">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
            Checking…
          </div>
        ) : (
          r.checks.map((c) => {
            const icon = c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : "⚠️";
            return (
              <div key={c.detail} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className="w-5 shrink-0 text-center">{icon}</span>
                <span>{c.detail}</span>
              </div>
            );
          })
        )}
      </Card>
    );
  });
}

export function DoctorTab({ data }: { data: ProviderEntry[] }) {
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
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🩺 Doctor</h2>

      <InventorySectionHeader title="已安裝" count={installed.length} variant="installed" />
      <DoctorCards entries={installed} results={results} />

      <InventorySectionHeader title="未安裝" count={notInstalled.length} variant="notInstalled" />
      <DoctorCards entries={notInstalled} results={results} />
    </>
  );
}

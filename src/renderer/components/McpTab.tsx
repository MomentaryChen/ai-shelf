import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { Badge, InstallStatusBadge } from "./Badge";
import { Tag } from "./Tag";
import { McpSyncPanel } from "./McpSyncPanel";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";
import { useLocale } from "../i18n/LocaleProvider";

function McpCards({ entries }: { entries: ProviderEntry[] }) {
  const { t } = useLocale();
  return entries.map((e) => (
    <Card
      key={e.tool}
      className={installedCardClass(e.available)}
      title={<ToolNameCell entry={e} />}
      trailing={
        !e.available ? (
          <InstallStatusBadge available={false} />
        ) : e.mcp.supported ? (
          <Badge text={t("inventory.mcp.supported")} variant="ok" />
        ) : (
          <Badge text={t("inventory.mcp.notSupported")} variant="fail" />
        )
      }
    >
      {!e.available ? (
        <p className="text-[13px] text-text-tertiary">{t("inventory.skipMcp")}</p>
      ) : (
        <>
          {e.mcp.servers.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {e.mcp.servers.map((s) => <Tag key={s}>🔌 {s}</Tag>)}
            </div>
          ) : e.mcp.supported ? (
            <p className="mb-3 text-text-secondary">{t("inventory.mcp.noneConfigured")}</p>
          ) : null}

          {e.mcp.configPaths.length > 0 && (
            <div className="mt-2">
              {e.mcp.configPaths.map((p) => (
                <div key={p} className="mb-1">
                  <span
                    className="break-all rounded bg-accent/8 px-1.5 py-0.5 font-mono text-xs text-accent cursor-pointer hover:bg-accent/20 hover:underline"
                    title={t("inventory.clickOpen")}
                    onClick={() => window.api.openPath(p)}
                  >
                    {p}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  ));
}

export function McpTab({ data }: { data: ProviderEntry[] }) {
  const { t } = useLocale();
  const { installed, notInstalled } = partitionByInstalled(data);
  const allServers = [...new Set(installed.flatMap((e) => e.mcp.servers))];

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">🔌 {t("app.tab.mcp")}</h2>

      {allServers.length > 0 && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <div className="rounded-lg border border-border bg-bg-secondary p-4 text-center">
            <div className="text-[28px] font-bold text-accent">{allServers.length}</div>
            <div className="mt-1 text-xs text-text-secondary">{t("inventory.mcpUnique")}</div>
          </div>
        </div>
      )}

      <InventorySectionHeader count={installed.length} variant="installed" />
      <McpCards entries={installed} />

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <McpCards entries={notInstalled} />

      <McpSyncPanel />
    </>
  );
}

import { Plug } from "lucide-react";
import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";
import { StatCard } from "./StatCard";
import { Badge, InstallStatusBadge } from "./Badge";
import { Tag } from "./Tag";
import { McpSyncPanel } from "./McpSyncPanel";
import { McpServerManager } from "./McpServerManager";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";
import { MCP_SYNC_TOOL_IDS, canonicalToolId } from "../../tools.js";
import { useLocale } from "../i18n/LocaleProvider";

const EDITABLE_TOOLS = new Set<string>(MCP_SYNC_TOOL_IDS);

function McpCards({ entries }: { entries: ProviderEntry[] }) {
  const { t } = useLocale();
  return entries.map((e) => {
    const toolId = canonicalToolId(e.tool);
    return (
    <Card
      key={e.tool}
      collapsible
      defaultCollapsed
      dense
      className={installedCardClass(e.available)}
      title={<ToolNameCell entry={e} />}
      trailing={
        !e.available ? (
          <InstallStatusBadge available={false} />
        ) : e.mcp.supported ? (
          <Badge text={t("inventory.mcp.supported")} variant="ok" />
        ) : (
          <Badge text={t("inventory.mcp.notSupported")} variant="neutral" />
        )
      }
    >
      {!e.available ? (
        <p className="text-[13px] text-text-tertiary">{t("inventory.skipMcp")}</p>
      ) : (
        <>
          {EDITABLE_TOOLS.has(toolId) ? (
            <McpServerManager tool={toolId} />
          ) : e.mcp.servers.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {e.mcp.servers.map((s) => (
                <Tag key={s}>
                  <Plug aria-hidden className="h-3 w-3 text-text-tertiary" /> {s}
                </Tag>
              ))}
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
    );
  });
}

export function McpTab({ data }: { data: ProviderEntry[] }) {
  const { t } = useLocale();
  const { installed, notInstalled } = partitionByInstalled(data);
  const allServers = [...new Set(installed.flatMap((e) => e.mcp.servers))];

  return (
    <>
      <SectionHeading icon={Plug}>{t("app.tab.mcp")}</SectionHeading>

      {allServers.length > 0 && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          <StatCard value={allServers.length} label={t("inventory.mcpUnique")} />
        </div>
      )}

      <InventorySectionHeader count={installed.length} variant="installed" />
      <div className="ui-stagger-children">
        <McpCards entries={installed} />
      </div>

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <div className="ui-stagger-children">
        <McpCards entries={notInstalled} />
      </div>

      <McpSyncPanel />
    </>
  );
}

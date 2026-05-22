import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { Badge } from "./Badge";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";
import { useLocale } from "../i18n/LocaleProvider";

function ConfigCards({ entries }: { entries: ProviderEntry[] }) {
  const { t } = useLocale();
  return entries.map((e) => {
    const allPaths = [
      ...e.config.paths.map((p) => ({ type: "Config", path: p })),
      ...e.config.instructionFiles.map((p) => ({ type: "Instructions", path: p })),
      ...e.mcp.configPaths.map((p) => ({ type: "MCP", path: p })),
    ];

    return (
      <Card key={e.tool} className={installedCardClass(e.available)} title={<ToolNameCell entry={e} />}>
        {!e.available ? (
          <p className="text-[13px] text-text-tertiary">
            {allPaths.length > 0 ? t("inventory.configResidual") : t("inventory.configNone")}
          </p>
        ) : null}
        {allPaths.length > 0 ? (
          <DataTable headers={["Type", "Path"]}>
            {allPaths.map((item) => (
              <tr key={item.path}>
                <Td><Badge text={item.type} variant="info" /></Td>
                <Td>
                  <span
                    className="break-all rounded bg-accent/8 px-1.5 py-0.5 font-mono text-xs text-accent cursor-pointer hover:bg-accent/20 hover:underline"
                    title={t("inventory.clickOpen")}
                    onClick={() => window.api.openPath(item.path)}
                  >
                    {item.path}
                  </span>
                </Td>
              </tr>
            ))}
          </DataTable>
        ) : e.available ? (
          <p className="text-text-secondary">{t("inventory.config.noFiles")}</p>
        ) : null}
      </Card>
    );
  });
}

export function ConfigTab({ data }: { data: ProviderEntry[] }) {
  const { t } = useLocale();
  const { installed, notInstalled } = partitionByInstalled(data);

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">⚙️ {t("app.tab.config")}</h2>

      <InventorySectionHeader count={installed.length} variant="installed" />
      <ConfigCards entries={installed} />

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <ConfigCards entries={notInstalled} />
    </>
  );
}

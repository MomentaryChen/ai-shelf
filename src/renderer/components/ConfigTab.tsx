import { Settings } from "lucide-react";
import { useState } from "react";
import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { Badge } from "./Badge";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { SectionHeading } from "./SectionHeading";
import { ConfigFileEditorModal } from "./ConfigFileEditorModal";
import { ConfigSnapshotPanel } from "./ConfigSnapshotPanel";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";
import { useLocale } from "../i18n/LocaleProvider";

/** Config files are text-editable in-app; other formats fall back to open-only. */
const EDITABLE_RE = /\.(json|jsonc|toml|ya?ml|md|txt)$/i;

function ConfigCards({
  entries,
  onEdit,
}: {
  entries: ProviderEntry[];
  onEdit: (path: string) => void;
}) {
  const { t } = useLocale();
  return (
    <>
      {entries.map((e) => {
        const allPaths = [
          ...e.config.paths.map((p) => ({ type: "Config", path: p })),
          ...e.config.instructionFiles.map((p) => ({ type: "Instructions", path: p })),
          ...e.mcp.configPaths.map((p) => ({ type: "MCP", path: p })),
        ];

        return (
          <Card
            key={e.tool}
            collapsible
            defaultCollapsed
            className={installedCardClass(e.available)}
            title={<ToolNameCell entry={e} />}
          >
            {!e.available ? (
              <p className="text-[13px] text-text-tertiary">
                {allPaths.length > 0 ? t("inventory.configResidual") : t("inventory.configNone")}
              </p>
            ) : null}
            {allPaths.length > 0 ? (
              <DataTable headers={["Type", "Path", ""]}>
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
                    <Td>
                      {EDITABLE_RE.test(item.path) && (
                        <button
                          type="button"
                          className="whitespace-nowrap rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
                          onClick={() => onEdit(item.path)}
                        >
                          ✏️ {t("configEditor.edit")}
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </DataTable>
            ) : e.available ? (
              <p className="text-text-secondary">{t("inventory.config.noFiles")}</p>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

export function ConfigTab({ data, onRefresh }: { data: ProviderEntry[]; onRefresh?: () => void }) {
  const { t } = useLocale();
  const { installed, notInstalled } = partitionByInstalled(data);
  const [editPath, setEditPath] = useState<string | null>(null);

  return (
    <>
      <SectionHeading icon={Settings}>{t("app.tab.config")}</SectionHeading>

      <ConfigSnapshotPanel onRestored={onRefresh} />

      <InventorySectionHeader count={installed.length} variant="installed" />
      <div className="ui-stagger-children">
        <ConfigCards entries={installed} onEdit={setEditPath} />
      </div>

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <div className="ui-stagger-children">
        <ConfigCards entries={notInstalled} onEdit={setEditPath} />
      </div>

      {editPath && (
        <ConfigFileEditorModal path={editPath} onClose={() => setEditPath(null)} />
      )}
    </>
  );
}

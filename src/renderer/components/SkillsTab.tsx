import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { Badge, InstallStatusBadge } from "./Badge";
import { Tag } from "./Tag";
import { SkillsMcpDiffPanel } from "./SkillsMcpDiffPanel";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { toolIcon, toolLabel } from "../utils";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";
import { useLocale } from "../i18n/LocaleProvider";

function SkillsCards({ entries }: { entries: ProviderEntry[] }) {
  const { t } = useLocale();
  return entries.map((e) => (
    <Card
      key={e.tool}
      className={installedCardClass(e.available)}
      title={<ToolNameCell entry={e} />}
      trailing={
        e.available ? (
          <Badge text={t("inventory.skills.count", { count: e.skills.length })} variant="info" />
        ) : (
          <InstallStatusBadge available={false} />
        )
      }
    >
      {e.available ? (
        <div className="flex flex-wrap gap-1.5">
          {e.skills.map((s) => <Tag key={s}>{s}</Tag>)}
        </div>
      ) : (
        <p className="text-[13px] text-text-tertiary">{t("inventory.skipSkills")}</p>
      )}
    </Card>
  ));
}

export function SkillsTab({
  data,
  onOpenMcpSync,
}: {
  data: ProviderEntry[];
  onOpenMcpSync: () => void;
}) {
  const { t } = useLocale();
  const { installed, notInstalled } = partitionByInstalled(data);
  const allSkills = [...new Set(installed.flatMap((e) => e.skills))].sort();

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">⚡ {t("app.tab.skills")}</h2>

      <SkillsMcpDiffPanel data={data} onOpenMcpSync={onOpenMcpSync} />

      <InventorySectionHeader count={installed.length} variant="installed" />
      <SkillsCards entries={installed} />

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <SkillsCards entries={notInstalled} />

      {/* Skill matrix */}
      <Card title={t("inventory.skillMatrix")}>
        <DataTable headers={["Skill", ...installed.map((e) => (
          <span key={e.tool} className="flex items-center gap-1.5">{toolIcon(e.tool)} {toolLabel(e.tool)}</span>
        ))]}>
          {allSkills.map((skill) => (
            <tr key={skill}>
              <Td>{skill}</Td>
              {installed.map((e) => (
                <Td key={e.tool}>{e.skills.includes(skill) ? "✅" : "—"}</Td>
              ))}
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}

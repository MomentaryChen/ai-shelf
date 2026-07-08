import { Check, Zap } from "lucide-react";
import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";
import { DataTable, Td } from "./DataTable";
import { Badge, InstallStatusBadge } from "./Badge";
import { SkillsMcpDiffPanel } from "./SkillsMcpDiffPanel";
import { SkillsSyncPanel } from "./SkillsSyncPanel";
import { SkillTags, resolveSkillDetails } from "./SkillTags";
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
      dense
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
        <SkillTags skills={resolveSkillDetails(e)} />
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
      <SectionHeading icon={Zap}>{t("app.tab.skills")}</SectionHeading>

      <SkillsMcpDiffPanel data={data} onOpenMcpSync={onOpenMcpSync} />

      <SkillsSyncPanel />

      <InventorySectionHeader count={installed.length} variant="installed" />
      <div className="ui-stagger-children">
        <SkillsCards entries={installed} />
      </div>

      <InventorySectionHeader count={notInstalled.length} variant="notInstalled" />
      <div className="ui-stagger-children">
        <SkillsCards entries={notInstalled} />
      </div>

      {/* Skill matrix */}
      {allSkills.length > 0 && (
        <Card title={t("inventory.skillMatrix")}>
          <DataTable headers={["Skill", ...installed.map((e) => (
            <span key={e.tool} className="flex items-center gap-1.5">{toolIcon(e.tool)} {toolLabel(e.tool)}</span>
          ))]}>
            {allSkills.map((skill) => (
              <tr key={skill}>
                <Td>{skill}</Td>
                {installed.map((e) => (
                  <Td key={e.tool}>
                    {e.skills.includes(skill) ? (
                      <Check aria-label="yes" className="h-4 w-4 text-ok" />
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </Td>
                ))}
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </>
  );
}

import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { Badge, InstallStatusBadge } from "./Badge";
import { Tag } from "./Tag";
import { ToolNameCell } from "./ToolNameCell";
import { InventorySectionHeader } from "./InventorySection";
import { toolIcon, toolLabel } from "../utils";
import { partitionByInstalled, installedCardClass } from "../utils/inventory-display";

function SkillsCards({ entries }: { entries: ProviderEntry[] }) {
  return entries.map((e) => (
    <Card
      key={e.tool}
      className={installedCardClass(e.available)}
      title={<ToolNameCell entry={e} />}
      trailing={
        e.available ? (
          <Badge text={`${e.skills.length} skills`} variant="info" />
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
        <p className="text-[13px] text-text-tertiary">未安裝，無法掃描技能清單</p>
      )}
    </Card>
  ));
}

export function SkillsTab({ data }: { data: ProviderEntry[] }) {
  const { installed, notInstalled } = partitionByInstalled(data);
  const allSkills = [...new Set(installed.flatMap((e) => e.skills))].sort();

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">⚡ Skills</h2>

      <InventorySectionHeader title="已安裝" count={installed.length} variant="installed" />
      <SkillsCards entries={installed} />

      <InventorySectionHeader title="未安裝" count={notInstalled.length} variant="notInstalled" />
      <SkillsCards entries={notInstalled} />

      {/* Skill matrix */}
      <Card title="Skill Matrix">
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

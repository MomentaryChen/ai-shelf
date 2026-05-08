import type { ProviderEntry } from "../types";
import { Card } from "./Card";
import { DataTable, Td } from "./DataTable";
import { Badge } from "./Badge";
import { Tag } from "./Tag";
import { toolIcon, toolLabel } from "../utils";

export function SkillsTab({ data }: { data: ProviderEntry[] }) {
  const allSkills = [...new Set(data.flatMap((e) => e.skills))].sort();

  return (
    <>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">⚡ Skills</h2>

      {data.map((e) => (
        <Card
          key={e.tool}
          title={<>{toolIcon(e.tool)} {toolLabel(e.tool)}</>}
          trailing={<Badge text={`${e.skills.length} skills`} variant="info" />}
        >
          <div className="flex flex-wrap gap-1.5">
            {e.skills.map((s) => <Tag key={s}>{s}</Tag>)}
          </div>
        </Card>
      ))}

      {/* Skill matrix */}
      <Card title="Skill Matrix">
        <DataTable headers={["Skill", ...data.map((e) => (
          <span key={e.tool} className="flex items-center gap-1.5">{toolIcon(e.tool)} {toolLabel(e.tool)}</span>
        ))]}>          {allSkills.map((skill) => (
            <tr key={skill}>
              <Td>{skill}</Td>
              {data.map((e) => (
                <Td key={e.tool}>{e.skills.includes(skill) ? "✅" : "—"}</Td>
              ))}
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}

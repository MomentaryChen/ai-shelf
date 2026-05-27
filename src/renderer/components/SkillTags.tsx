import type { SkillEntry } from "../types";
import { Tag } from "./Tag";
import { useLocale } from "../i18n/LocaleProvider";

function skillTooltip(skill: SkillEntry, scopeLabel: string): string {
  const parts = [skill.path];
  if (skill.description) parts.unshift(skill.description);
  parts.push(`(${scopeLabel})`);
  return parts.join("\n");
}

export function SkillTags({ skills }: { skills: SkillEntry[] }) {
  const { t } = useLocale();

  if (skills.length === 0) {
    return <p className="text-[13px] text-text-tertiary">{t("inventory.skills.empty")}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((skill) => (
        <Tag
          key={`${skill.scope}:${skill.name}`}
          title={skillTooltip(skill, t(`inventory.skills.scope.${skill.scope}`))}
        >
          {skill.name}
        </Tag>
      ))}
    </div>
  );
}

export function resolveSkillDetails(entry: {
  skills: string[];
  skillDetails?: SkillEntry[];
}): SkillEntry[] {
  if (entry.skillDetails?.length) return entry.skillDetails;
  return entry.skills.map((name) => ({
    name,
    path: "",
    scope: "global" as const,
  }));
}

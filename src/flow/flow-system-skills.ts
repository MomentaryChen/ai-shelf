import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type FlowSystemSkill = {
  name: string;
  path: string;
  content: string;
};

export function systemSkillsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "system-skills");
}

/** Bundled SKILL.md files injected into every agent flow run. */
export function loadFlowSystemSkills(): FlowSystemSkill[] {
  const root = systemSkillsDir();
  if (!existsSync(root)) return [];

  const loaded: FlowSystemSkill[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(root, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    loaded.push({
      name: entry.name,
      path: skillPath,
      content: readFileSync(skillPath, "utf8"),
    });
  }
  return loaded.sort((a, b) => a.name.localeCompare(b.name));
}

export function formatSystemSkillsSection(skills: FlowSystemSkill[]): string {
  if (skills.length === 0) return "";
  const blocks = skills.map(
    (skill) => `### ${skill.name}\nPath: ${skill.path}\n\n${skill.content.trim()}`,
  );
  return `【系統技能 — 每次 run 自動載入，請遵守】

${blocks.join("\n\n---\n\n")}`;
}

export function buildFlowRunPrompt(body: string, phaseIds: string[]): string {
  const phaseList =
    phaseIds.length > 0
      ? phaseIds.map((id) => `- ${id}`).join("\n")
      : "- (no predefined phases — emit progress if you use logical steps)";

  const skillBlock = formatSystemSkillsSection(loadFlowSystemSkills());

  return `${body.trim()}${skillBlock ? `\n\n${skillBlock}` : ""}

---
【執行協議 — 系統注入，請遵守】

已知 phase id：
${phaseList}`;
}

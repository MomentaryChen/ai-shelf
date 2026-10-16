import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  home,
  cwd,
  tryReadJson,
  xdgConfigHome,
  claudeConfigDir,
  codexHome,
  opencodeConfigDir,
} from "../utils/config.js";
import type { ProviderEntry, SkillEntry, SkillScope } from "./types.js";

export interface SkillScanRoot {
  path: string;
  scope: SkillScope;
}

function expandPath(raw: string): string {
  let out = raw.trim();
  if (out.startsWith("~/")) out = join(homedir(), out.slice(2));
  else if (out === "~") out = homedir();

  for (const [key, val] of Object.entries(process.env)) {
    if (val) out = out.replaceAll(`%${key}%`, val);
  }
  return out;
}

function resolveSkillRoot(raw: string): string {
  const expanded = expandPath(raw);
  const isAbsolute =
    expanded.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(expanded) ||
    expanded.startsWith("~") ||
    expanded.includes("%");
  if (isAbsolute) return expanded;
  return join(process.cwd(), expanded);
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse `name` / `description` from SKILL.md YAML frontmatter. */
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const result: { name?: string; description?: string } = {};
  const descLines: string[] = [];
  let inDescription = false;

  for (const line of match[1].split("\n")) {
    if (inDescription) {
      if (/^\S/.test(line) && !line.startsWith(" ")) {
        inDescription = false;
      } else {
        descLines.push(line.replace(/^\s+/, ""));
        continue;
      }
    }

    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) {
      result.name = stripQuotes(nameMatch[1].trim());
      continue;
    }

    if (/^description:\s*>-?\s*$/.test(line)) {
      inDescription = true;
      continue;
    }

    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) {
      result.description = stripQuotes(descMatch[1].trim());
    }
  }

  if (descLines.length > 0) {
    result.description = descLines.join(" ").trim();
  }

  return result;
}

function scanSkillDir(root: string, scope: SkillScope): SkillEntry[] {
  const resolved = resolveSkillRoot(root);
  if (!existsSync(resolved)) return [];

  const skills: SkillEntry[] = [];
  try {
    for (const entry of readdirSync(resolved, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(resolved, entry.name, "SKILL.md");
      if (!existsSync(skillMd)) continue;

      try {
        const content = readFileSync(skillMd, "utf-8");
        const meta = parseSkillFrontmatter(content);
        skills.push({
          name: meta.name ?? entry.name,
          description: meta.description,
          path: skillMd,
          scope,
        });
      } catch {
        skills.push({ name: entry.name, path: skillMd, scope });
      }
    }
  } catch {
    return [];
  }

  return skills;
}

/** Later roots win when skill names collide. */
export function dedupeSkills(skills: SkillEntry[]): SkillEntry[] {
  const map = new Map<string, SkillEntry>();
  for (const skill of skills) map.set(skill.name, skill);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function scanSkillsFromRoots(roots: SkillScanRoot[]): SkillEntry[] {
  const all: SkillEntry[] = [];
  for (const { path, scope } of roots) {
    all.push(...scanSkillDir(path, scope));
  }
  return dedupeSkills(all);
}

export function skillNames(entries: SkillEntry[]): string[] {
  return entries.map((e) => e.name);
}

export function withScannedSkills(
  roots: SkillScanRoot[],
): Pick<ProviderEntry, "skills" | "skillDetails"> {
  const skillDetails = scanSkillsFromRoots(roots);
  return { skills: skillNames(skillDetails), skillDetails };
}

export function getLocalAppData(...segments: string[]): string {
  const local = process.env["LOCALAPPDATA"] ?? home("AppData", "Local");
  return join(local, ...segments);
}

function readCrushConfigSkillsPaths(): SkillScanRoot[] {
  const configFiles = [
    cwd(".crush.json"),
    cwd("crush.json"),
    xdgConfigHome("crush", "crush.json"),
  ];
  const roots: SkillScanRoot[] = [];

  for (const file of configFiles) {
    const data = tryReadJson<{ options?: { skills_paths?: string[] } }>(file);
    const paths = data?.options?.skills_paths;
    if (!paths) continue;
    for (const raw of paths) {
      roots.push({ path: resolveSkillRoot(raw), scope: "config" });
    }
  }

  return roots;
}

export function cursorSkillRoots(): SkillScanRoot[] {
  return [
    { path: home(".cursor", "skills"), scope: "global" },
    { path: cwd(".cursor", "skills"), scope: "project" },
  ];
}

export function claudeSkillRoots(): SkillScanRoot[] {
  return [
    { path: claudeConfigDir("skills"), scope: "global" },
    { path: cwd(".claude", "skills"), scope: "project" },
    { path: home(".agents", "skills"), scope: "global" },
    { path: cwd(".agents", "skills"), scope: "project" },
  ];
}

/**
 * GitHub Copilot CLI: personal `$COPILOT_HOME/skills` (default `~/.copilot/skills`)
 * and `~/.agents/skills`; project `.github/skills`, `.claude/skills`, `.agents/skills`.
 */
export function copilotSkillRoots(): SkillScanRoot[] {
  const copilotHome = process.env["COPILOT_HOME"] || home(".copilot");
  return [
    { path: join(copilotHome, "skills"), scope: "global" },
    { path: home(".agents", "skills"), scope: "global" },
    { path: cwd(".github", "skills"), scope: "project" },
    { path: cwd(".claude", "skills"), scope: "project" },
    { path: cwd(".agents", "skills"), scope: "project" },
  ];
}

/**
 * OpenAI Codex: user `~/.agents/skills` (current) and `$CODEX_HOME/skills`
 * (legacy, default `~/.codex/skills`); repo `.agents/skills` (and legacy `.codex/skills`).
 */
export function codexSkillRoots(): SkillScanRoot[] {
  return [
    { path: codexHome("skills"), scope: "global" },
    { path: home(".agents", "skills"), scope: "global" },
    { path: cwd(".codex", "skills"), scope: "project" },
    { path: cwd(".agents", "skills"), scope: "project" },
  ];
}

/**
 * OpenCode: global `$XDG_CONFIG_HOME/opencode/skills` (plus `$OPENCODE_CONFIG_DIR/skills`),
 * project `.opencode/skills`; also reads Claude- and agents-compatible directories.
 */
export function opencodeSkillRoots(): SkillScanRoot[] {
  const roots: SkillScanRoot[] = [
    { path: home(".claude", "skills"), scope: "global" },
    { path: home(".agents", "skills"), scope: "global" },
    { path: opencodeConfigDir("skills"), scope: "global" },
  ];
  const configDir = process.env["OPENCODE_CONFIG_DIR"];
  if (configDir) roots.push({ path: join(configDir, "skills"), scope: "config" });
  roots.push(
    { path: cwd(".claude", "skills"), scope: "project" },
    { path: cwd(".agents", "skills"), scope: "project" },
    { path: cwd(".opencode", "skills"), scope: "project" },
  );
  return roots;
}

export function crushSkillRoots(): SkillScanRoot[] {
  const roots: SkillScanRoot[] = [
    { path: cwd(".agents", "skills"), scope: "project" },
    { path: cwd(".crush", "skills"), scope: "project" },
    { path: cwd(".claude", "skills"), scope: "project" },
    { path: cwd(".cursor", "skills"), scope: "project" },
    ...readCrushConfigSkillsPaths(),
  ];

  const crushSkillsDir = process.env["CRUSH_SKILLS_DIR"];
  if (crushSkillsDir) {
    roots.push({ path: crushSkillsDir, scope: "config" });
  }

  roots.push(
    { path: xdgConfigHome("agents", "skills"), scope: "global" },
    { path: xdgConfigHome("crush", "skills"), scope: "global" },
    { path: home(".agents", "skills"), scope: "global" },
    { path: home(".claude", "skills"), scope: "global" },
    { path: getLocalAppData("agents", "skills"), scope: "global" },
    { path: getLocalAppData("crush", "skills"), scope: "global" },
  );

  return roots;
}

export function gooseSkillRoots(): SkillScanRoot[] {
  return [
    { path: cwd(".agents", "skills"), scope: "project" },
    { path: cwd(".goose", "skills"), scope: "project" },
    { path: cwd(".claude", "skills"), scope: "project" },
    { path: xdgConfigHome("agents", "skills"), scope: "global" },
    { path: home(".goose", "skills"), scope: "global" },
    { path: home(".claude", "skills"), scope: "global" },
    { path: home(".agents", "skills"), scope: "global" },
  ];
}

export function geminiSkillRoots(): SkillScanRoot[] {
  return [
    { path: home(".gemini", "skills"), scope: "global" },
    { path: cwd(".gemini", "skills"), scope: "project" },
    { path: home(".agents", "skills"), scope: "global" },
    { path: cwd(".agents", "skills"), scope: "project" },
  ];
}

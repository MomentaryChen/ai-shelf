import { cpSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { SKILL_SYNC_TOOL_IDS, canonicalToolId } from "../tools.js";
import type { SkillEntry } from "../inventory/types.js";
import {
  claudeSkillRoots,
  crushSkillRoots,
  cursorSkillRoots,
  geminiSkillRoots,
  gooseSkillRoots,
  scanSkillsFromRoots,
  type SkillScanRoot,
} from "../inventory/skills-scan.js";

export const SYNC_SKILL_TOOLS = SKILL_SYNC_TOOL_IDS;

export type SkillsMap = Record<string, SkillEntry>;

export interface SkillSyncWriteResult {
  added: string[];
  skipped: string[];
  error?: string;
}

function skillRootsForTool(tool: string): SkillScanRoot[] {
  switch (canonicalToolId(tool)) {
    case "claude":
      return claudeSkillRoots();
    case "cursor":
      return cursorSkillRoots();
    case "gemini":
      return geminiSkillRoots();
    case "crush":
      return crushSkillRoots();
    case "goose":
      return gooseSkillRoots();
    default:
      return [];
  }
}

/** Primary global skills directory for writing synced skills into a tool. */
export function getSkillWriteRoot(tool: string): string | null {
  const roots = skillRootsForTool(tool);
  const global = roots.find((r) => r.scope === "global");
  return global?.path ?? roots[0]?.path ?? null;
}

/** Read skills for a tool keyed by skill name. */
export function readSkillsForTool(tool: string): SkillsMap {
  const roots = skillRootsForTool(tool);
  if (roots.length === 0) return {};

  const map: SkillsMap = {};
  for (const skill of scanSkillsFromRoots(roots)) {
    map[skill.name] = skill;
  }
  return map;
}

/**
 * Collect the union of all skills across sync-enabled tools.
 * When `sourceTool` is set, that tool's entries win for content (source of truth).
 */
export function collectAllSkills(sourceTool?: string): SkillsMap {
  const all: SkillsMap = {};
  const preferred =
    sourceTool && (SYNC_SKILL_TOOLS as readonly string[]).includes(sourceTool)
      ? sourceTool
      : undefined;
  const order = preferred
    ? [preferred, ...SYNC_SKILL_TOOLS.filter((t) => t !== preferred)]
    : [...SYNC_SKILL_TOOLS];

  for (const tool of order) {
    const skills = readSkillsForTool(tool);
    for (const [name, entry] of Object.entries(skills)) {
      if (!all[name]) all[name] = entry;
    }
  }
  return all;
}

function skillDirFromPath(skillMdPath: string): string {
  return dirname(skillMdPath);
}

function skillFolderName(skillMdPath: string): string {
  return basename(skillDirFromPath(skillMdPath));
}

/** Copy missing skills into a tool's global skills directory. */
export function writeSkillsToTool(
  tool: string,
  skillNames: string[],
  allSkills: SkillsMap,
): SkillSyncWriteResult {
  const writeRoot = getSkillWriteRoot(tool);
  if (!writeRoot) {
    return { added: [], skipped: [], error: "Unknown tool" };
  }

  const existing = readSkillsForTool(tool);
  const added: string[] = [];
  const skipped: string[] = [];

  try {
    mkdirSync(writeRoot, { recursive: true });

    for (const name of skillNames) {
      if (existing[name]) {
        skipped.push(name);
        continue;
      }

      const source = allSkills[name];
      if (!source?.path || !existsSync(source.path)) continue;

      const sourceDir = skillDirFromPath(source.path);
      const destDir = join(writeRoot, skillFolderName(source.path));

      if (existsSync(destDir)) {
        skipped.push(name);
        continue;
      }

      cpSync(sourceDir, destDir, { recursive: true });
      added.push(name);
    }

    return { added, skipped };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { added, skipped, error: message };
  }
}

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { TaskDef } from "./task-types.js";

export const TASK_FILE_SUFFIX = ".task.md";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Task ids become file names under app data: one safe path segment only. */
export function isSafeTaskId(id: string): boolean {
  if (!id || id.length > 80) return false;
  if (id === "." || id === "..") return false;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return false;
  return !WINDOWS_RESERVED.test(id);
}

/** Lowercase ascii slug from a display name; empty when nothing usable remains (e.g. CJK). */
export function slugifyTaskName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** A new id from `name` that is not in `taken`. */
export function allocateTaskId(name: string, taken: ReadonlySet<string>, now = Date.now()): string {
  const slug = slugifyTaskName(name);
  const base = slug && isSafeTaskId(slug) ? slug : `task-${now.toString(36)}`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number") return String(value);
  return undefined;
}

function splitFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const text = content.replace(/^﻿/, "");
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return { meta: {}, body: text };
  let meta: unknown;
  try {
    meta = parseYaml(match[1]);
  } catch {
    meta = {};
  }
  const record = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  return { meta: record as Record<string, unknown>, body: match[2] ?? "" };
}

/** Parse a `.task.md` file. `fallbackId` (the file name) wins when the frontmatter id is unsafe. */
export function parseTaskFile(content: string, fallbackId: string): TaskDef {
  const { meta, body } = splitFrontmatter(content);
  const metaId = str(meta.id);
  const id = metaId && isSafeTaskId(metaId) ? metaId : fallbackId;
  const task: TaskDef = {
    id,
    name: str(meta.name) ?? id,
    prompt: body.replace(/^\r?\n+/, "").replace(/\s+$/, ""),
  };
  const description = str(meta.description);
  if (description) task.description = description;
  const profile = str(meta.profile);
  if (profile) task.profileId = profile;
  const tool = str(meta.tool);
  if (tool) task.tool = tool;
  return task;
}

export function serializeTaskFile(task: Omit<TaskDef, "updatedAt">): string {
  const meta: Record<string, string> = { id: task.id, name: task.name.trim() || task.id };
  if (task.description?.trim()) meta.description = task.description.trim();
  if (task.profileId?.trim()) meta.profile = task.profileId.trim();
  if (task.tool?.trim()) meta.tool = task.tool.trim();
  return `---\n${stringifyYaml(meta).trimEnd()}\n---\n\n${task.prompt.trim()}\n`;
}

/**
 * Convert a legacy AI Flow (`*.flow.md`) into a task. Returns null for flows with no agent
 * prompt (e.g. `runner: http` health checks). Phase markers `【id】` are dropped; the steps
 * stay in the prompt so the agent still follows them in order.
 */
export function taskFromLegacyFlow(content: string, fallbackId: string): TaskDef | null {
  const { meta, body } = splitFrontmatter(content);
  if (str(meta.runner) === "http") return null;

  const lines = body.replace(/^\s+/, "").split(/\r?\n/);
  let name: string | undefined;
  if (lines[0]?.startsWith("# ")) {
    name = lines.shift()!.slice(2).trim() || undefined;
  }
  const prompt = lines
    .join("\n")
    .replace(/^(#{1,6}\s*)【([^】]+)】\s*$/gm, "$1$2")
    .replace(/【[^】]+】\s*/g, "")
    .trim();
  if (!prompt) return null;

  const metaId = str(meta.id);
  const id = metaId && isSafeTaskId(metaId) ? metaId : fallbackId;
  const task: TaskDef = { id, name: name ?? id, prompt };
  const profile = str(meta.profile);
  if (profile) task.profileId = profile;
  return task;
}

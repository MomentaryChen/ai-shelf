/**
 * Pure helpers for the Tasks page — no Electron / DOM, so they run under `tsx --test`.
 */
import type { TaskDef } from "../../shared/task-types.js";

/** The renderer's `"shell"` tool id: a plain shell, no agent CLI. */
const PLAIN_SHELL_TOOL = "shell";

export interface ProfileLike {
  id: string;
  name: string;
  defaultTool: string;
}

export interface ProfileGroupLike<P extends ProfileLike = ProfileLike> {
  id: string;
  name: string;
  profiles: P[];
}

export type TaskProfileResolution<P extends ProfileLike = ProfileLike> =
  | { kind: "active" }
  | { kind: "found"; profile: P; groupName: string }
  | { kind: "missing"; ref: string };

/**
 * Resolve a task's `profileId` the way the runner does: trimmed, exact id first,
 * then exact name (hand-written task files may name the profile). Empty = active profile.
 */
export function resolveTaskProfile<P extends ProfileLike>(
  profileRef: string | undefined,
  groups: readonly ProfileGroupLike<P>[],
): TaskProfileResolution<P> {
  const ref = profileRef?.trim() ?? "";
  if (!ref) return { kind: "active" };
  for (const g of groups) {
    const p = g.profiles.find((x) => x.id === ref);
    if (p) return { kind: "found", profile: p, groupName: g.name };
  }
  for (const g of groups) {
    const p = g.profiles.find((x) => x.name === ref);
    if (p) return { kind: "found", profile: p, groupName: g.name };
  }
  return { kind: "missing", ref };
}

export function isAgentTool(tool: string | undefined): boolean {
  const id = tool?.trim();
  return !!id && id !== PLAIN_SHELL_TOOL;
}

/**
 * Problem the runner would report before spawning, detectable from the forest alone.
 * `activeProfile` is the profile an empty `profileId` would run in (null = none known).
 */
export function precheckTaskRun<P extends ProfileLike>(
  task: Pick<TaskDef, "profileId" | "tool">,
  groups: readonly ProfileGroupLike<P>[],
  activeProfile: P | null,
): "profile-not-found" | "no-agent-tool" | null {
  const r = resolveTaskProfile(task.profileId, groups);
  if (r.kind === "missing") return "profile-not-found";
  if (isAgentTool(task.tool)) return null;
  const profile = r.kind === "found" ? r.profile : activeProfile;
  // Unknown active profile: let the runner decide.
  if (!profile) return null;
  return isAgentTool(profile.defaultTool) ? null : "no-agent-tool";
}

/** Case-insensitive match on name, description, prompt and the resolved profile name. */
export function filterTasks<T extends Pick<TaskDef, "name" | "description" | "prompt" | "tool">>(
  tasks: readonly T[],
  query: string,
  profileLabel?: (task: T) => string | undefined,
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...tasks];
  return tasks.filter((task) => {
    const hay = [task.name, task.description, task.prompt, task.tool, profileLabel?.(task)]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * A name for a copy of `name` not already in `taken` (case-insensitive):
 * `"X"` → `"X (copy)"`, then `"X (copy 2)"`, … A copy of a copy keeps one suffix.
 */
export function duplicateTaskName(
  name: string,
  taken: Iterable<string>,
  copyWord = "copy",
): string {
  const used = new Set([...taken].map((n) => n.trim().toLowerCase()));
  const escaped = copyWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const base = name.trim().replace(new RegExp(`\\s*\\(${escaped}(?: \\d+)?\\)$`), "") || name.trim();
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${base} (${copyWord})` : `${base} (${copyWord} ${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** First `maxLines` non-empty lines of a prompt, for list previews. */
export function promptPreview(prompt: string, maxLines = 3): { text: string; truncated: boolean } {
  const lines = prompt.replace(/\r\n?/g, "\n").trim().split("\n");
  const kept = lines.slice(0, maxLines);
  return { text: kept.join("\n"), truncated: lines.length > maxLines };
}

/** Where a task's live terminal is. */
export interface TaskPaneRef {
  profileId: string;
  paneId: string;
}

/**
 * Live terminal per task id, from every loaded profile's panes. A task has at most one
 * terminal; if two panes carry the same id (e.g. a hand-edited layout), the first wins.
 */
export function collectTaskPanes(
  profiles: Iterable<{ profileId: string; panes: readonly { id: string; taskId?: string }[] }>,
): Map<string, TaskPaneRef> {
  const out = new Map<string, TaskPaneRef>();
  for (const { profileId, panes } of profiles) {
    for (const pane of panes) {
      const taskId = pane.taskId?.trim();
      if (taskId && !out.has(taskId)) out.set(taskId, { profileId, paneId: pane.id });
    }
  }
  return out;
}

/**
 * The task link a pane keeps when its PTY is started again (restart, restore, respawn).
 * It survives only if the same tool resumed the same agent conversation: a fresh agent
 * never got the prompt, so its task must be runnable again.
 */
export function keepTaskLink(
  prev: { tool: string; taskId?: string; agentSessionId?: string },
  next: { tool: string; agentSessionId?: string },
): { taskId?: string } {
  if (!prev.taskId || next.tool !== prev.tool) return {};
  if (!prev.agentSessionId || next.agentSessionId !== prev.agentSessionId) return {};
  return { taskId: prev.taskId };
}

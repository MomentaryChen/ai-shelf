/**
 * Pure helpers for the Claude Code `settings.json` hooks & permissions editor.
 *
 * Shared by the renderer (draft editing, validation, save preview) and the main
 * process (applies the same edit to the file on disk). No Node / Electron imports.
 *
 * Only `permissions` and `hooks` are ever modified; every other key — and the
 * position of existing keys — is carried over untouched.
 */

export type ClaudeSettingsScope = "user" | "project" | "local";

export const CLAUDE_SETTINGS_SCOPES: readonly ClaudeSettingsScope[] = ["user", "project", "local"];

export type PermissionListKey = "allow" | "ask" | "deny";

export const PERMISSION_LISTS: readonly PermissionListKey[] = ["allow", "ask", "deny"];

/** `permissions.defaultMode` values in the Claude Code settings schema. */
export const CLAUDE_DEFAULT_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
] as const;

/**
 * Hook events in the Claude Code settings schema (common ones first). Unknown
 * events found in a file are kept as-is and only flagged with a warning.
 */
export const CLAUDE_HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "SessionStart",
  "SessionEnd",
  "PostToolBatch",
  "UserPromptExpansion",
  "StopFailure",
  "PreModelSwitch",
  "PostModelSwitch",
  "PermissionDenied",
  "Setup",
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
  "Elicitation",
  "ElicitationResult",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
  "InstructionsLoaded",
  "CwdChanged",
  "FileChanged",
  "DirectoryAdded",
  "MessageDisplay",
] as const;

/** Events documented as not using a `matcher` (a matcher there is ignored). */
export const MATCHERLESS_HOOK_EVENTS: readonly string[] = ["UserPromptSubmit", "Stop"];

/**
 * Common built-in Claude Code tool names used as a permission-rule prefix. The
 * tool set changes between releases, so an unlisted name is only a soft hint.
 */
export const CLAUDE_KNOWN_TOOLS: readonly string[] = [
  "Agent",
  "AskUserQuestion",
  "Bash",
  "BashOutput",
  "Edit",
  "EnterWorktree",
  "ExitPlanMode",
  "ExitWorktree",
  "Glob",
  "Grep",
  "KillShell",
  "LS",
  "LSP",
  "Monitor",
  "MultiEdit",
  "NotebookEdit",
  "NotebookRead",
  "PowerShell",
  "Read",
  "SendMessage",
  "SlashCommand",
  "Skill",
  "Task",
  "TaskStop",
  "TodoWrite",
  "ToolSearch",
  "WebFetch",
  "WebSearch",
  "Write",
];

/** True for hook entries the editor treats as opaque (`prompt`, `agent`, `http`, `mcp_tool`, …). */
export function isOpaqueHook(cmd: HookCommandDraft): boolean {
  const type = cmd.extra["type"];
  return typeof type === "string" && type !== "command";
}

export interface PermissionsDraft {
  allow: string[];
  ask: string[];
  deny: string[];
  /** Empty string = key absent. */
  defaultMode: string;
  additionalDirectories: string[];
}

export interface HookCommandDraft {
  command: string;
  /** Seconds; undefined = key absent. */
  timeout?: number;
  /** Original object (keeps `type` and any unknown keys through a save). */
  extra: Record<string, unknown>;
}

export interface HookGroupDraft {
  matcher: string;
  commands: HookCommandDraft[];
  /** Original group object (unknown keys survive a save). */
  extra: Record<string, unknown>;
}

export interface HookEventDraft {
  event: string;
  groups: HookGroupDraft[];
}

export type HooksDraft = HookEventDraft[];

export interface ClaudeSettingsDraft {
  permissions: PermissionsDraft;
  hooks: HooksDraft;
}

export type ParseClaudeSettingsResult =
  | { ok: true; data: Record<string, unknown>; draft: ClaudeSettingsDraft }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function emptyDraft(): ClaudeSettingsDraft {
  return {
    permissions: { allow: [], ask: [], deny: [], defaultMode: "", additionalDirectories: [] },
    hooks: [],
  };
}

/** Build the editable draft from a parsed settings object. */
export function draftFromSettings(data: Record<string, unknown>): ClaudeSettingsDraft {
  const draft = emptyDraft();
  const perms = data["permissions"];
  if (isRecord(perms)) {
    draft.permissions.allow = stringList(perms["allow"]);
    draft.permissions.ask = stringList(perms["ask"]);
    draft.permissions.deny = stringList(perms["deny"]);
    draft.permissions.defaultMode =
      typeof perms["defaultMode"] === "string" ? perms["defaultMode"] : "";
    draft.permissions.additionalDirectories = stringList(perms["additionalDirectories"]);
  }
  const hooks = data["hooks"];
  if (isRecord(hooks)) {
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      const eventDraft: HookEventDraft = { event, groups: [] };
      for (const group of groups) {
        if (!isRecord(group)) continue;
        const commands: HookCommandDraft[] = [];
        for (const h of Array.isArray(group["hooks"]) ? group["hooks"] : []) {
          if (!isRecord(h)) continue;
          commands.push({
            command: typeof h["command"] === "string" ? h["command"] : "",
            timeout: typeof h["timeout"] === "number" ? h["timeout"] : undefined,
            extra: { ...h },
          });
        }
        eventDraft.groups.push({
          matcher: typeof group["matcher"] === "string" ? group["matcher"] : "",
          commands,
          extra: { ...group },
        });
      }
      draft.hooks.push(eventDraft);
    }
  }
  return draft;
}

/**
 * Parse settings file text. Strict JSON (Claude Code does not accept comments);
 * an empty / whitespace-only file is treated as `{}`.
 */
export function parseClaudeSettingsText(text: string): ParseClaudeSettingsResult {
  if (!text.trim()) return { ok: true, data: {}, draft: emptyDraft() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!isRecord(parsed)) return { ok: false, error: "Top-level value is not a JSON object" };
  return { ok: true, data: parsed, draft: draftFromSettings(parsed) };
}

function cleanList(list: string[]): string[] {
  return list.map((s) => s.trim()).filter(Boolean);
}

/** Replace `key` in place (keeps its position) or append it; `undefined` deletes it. */
function setKey(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) Reflect.deleteProperty(target, key);
  else target[key] = value;
}

function buildPermissions(
  original: unknown,
  draft: PermissionsDraft,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = isRecord(original) ? { ...original } : {};
  for (const list of PERMISSION_LISTS) {
    const items = cleanList(draft[list]);
    setKey(out, list, items.length > 0 ? items : undefined);
  }
  const mode = draft.defaultMode.trim();
  setKey(out, "defaultMode", mode || undefined);
  const dirs = cleanList(draft.additionalDirectories);
  setKey(out, "additionalDirectories", dirs.length > 0 ? dirs : undefined);
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildHooks(draft: HooksDraft): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const ev of draft) {
    const event = ev.event.trim();
    if (!event) continue;
    const groups: Record<string, unknown>[] = [];
    for (const g of ev.groups) {
      const hooks = g.commands
        .filter((c) => isOpaqueHook(c) || c.command.trim())
        .map((c) => {
          // Non-command hooks (prompt / agent / http / …) pass through untouched.
          if (isOpaqueHook(c)) return { ...c.extra };
          const h: Record<string, unknown> = { type: "command", ...c.extra };
          h["command"] = c.command;
          setKey(
            h,
            "timeout",
            c.timeout !== undefined && Number.isFinite(c.timeout) ? c.timeout : undefined,
          );
          return h;
        });
      if (hooks.length === 0) continue;
      const group: Record<string, unknown> = { ...g.extra };
      setKey(group, "matcher", g.matcher.trim() ? g.matcher : undefined);
      group["hooks"] = hooks;
      // New groups: put `matcher` first, like the docs.
      if (!("matcher" in g.extra) && "matcher" in group) {
        const { matcher, ...rest } = group;
        groups.push({ matcher, ...rest });
      } else {
        groups.push(group);
      }
    }
    if (groups.length === 0) continue;
    const existing = out[event];
    out[event] = Array.isArray(existing) ? [...(existing as unknown[]), ...groups] : groups;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Apply the draft to a parsed settings object: only `permissions` / `hooks` change,
 * other keys keep their values and order. Empty sections are removed.
 */
export function applyClaudeSettingsDraft(
  data: Record<string, unknown>,
  draft: ClaudeSettingsDraft,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  // A section the user did not touch is left exactly as it was in the file
  // (keeps empty arrays, `"matcher": ""`, odd values the draft cannot express).
  const before = draftFromSettings(data);
  if (JSON.stringify(before.permissions) !== JSON.stringify(draft.permissions)) {
    setKey(out, "permissions", buildPermissions(data["permissions"], draft.permissions));
  }
  if (JSON.stringify(before.hooks) !== JSON.stringify(draft.hooks)) {
    setKey(out, "hooks", buildHooks(draft.hooks));
  }
  return out;
}

/** 2-space JSON with a trailing newline; keeps CRLF when the original used it. */
export function serializeClaudeSettings(data: Record<string, unknown>, originalText = ""): string {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  return originalText.includes("\r\n") ? text.replace(/\n/g, "\r\n") : text;
}

/**
 * Full round trip used for both the save preview and the actual write.
 * Throws when `originalText` is not a JSON object.
 */
export function renderClaudeSettingsEdit(originalText: string, draft: ClaudeSettingsDraft): string {
  const parsed = parseClaudeSettingsText(originalText);
  if (!parsed.ok) throw new Error(parsed.error);
  return serializeClaudeSettings(applyClaudeSettingsDraft(parsed.data, draft), originalText);
}

// ── Validation (warnings only — never blocks a save) ─────────────────────────

export type PermissionRuleWarning = "empty" | "unbalancedParens" | "unknownTool" | "badFormat";

const RULE_RE = /^([A-Za-z][A-Za-z0-9_]*)(?:\((.*)\))?$/s;

/** Light syntax check of one permission rule (`Tool`, `Tool(specifier)`, `mcp__server__tool`). */
export function validatePermissionRule(rule: string): PermissionRuleWarning | null {
  const r = rule.trim();
  if (!r) return "empty";
  let depth = 0;
  for (const ch of r) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return "unbalancedParens";
  }
  if (depth !== 0) return "unbalancedParens";
  if (r.startsWith("mcp__")) return /^mcp__[^\s()]+$/.test(r) ? null : "badFormat";
  const m = RULE_RE.exec(r);
  if (!m) return "badFormat";
  return CLAUDE_KNOWN_TOOLS.includes(m.at(1) ?? "") ? null : "unknownTool";
}

export interface PermissionConflict {
  rule: string;
  lists: PermissionListKey[];
}

/** Rules that appear in more than one of allow / ask / deny (deny wins in Claude Code). */
export function findPermissionConflicts(draft: PermissionsDraft): PermissionConflict[] {
  const seen = new Map<string, Set<PermissionListKey>>();
  for (const list of PERMISSION_LISTS) {
    for (const raw of draft[list]) {
      const rule = raw.trim();
      if (!rule) continue;
      let lists = seen.get(rule);
      if (!lists) seen.set(rule, (lists = new Set()));
      lists.add(list);
    }
  }
  const out: PermissionConflict[] = [];
  for (const [rule, lists] of seen) {
    if (lists.size > 1) out.push({ rule, lists: PERMISSION_LISTS.filter((l) => lists.has(l)) });
  }
  return out;
}

export type HookWarning =
  | "emptyCommand"
  | "badTimeout"
  | "unknownEvent"
  | "matcherIgnored"
  | "badMatcher";

export function validateHookEvent(event: string): HookWarning | null {
  return (CLAUDE_HOOK_EVENTS as readonly string[]).includes(event) ? null : "unknownEvent";
}

export function validateHookMatcher(event: string, matcher: string): HookWarning | null {
  if (!matcher.trim()) return null;
  if (MATCHERLESS_HOOK_EVENTS.includes(event)) return "matcherIgnored";
  if (matcher === "*") return null;
  try {
    new RegExp(matcher);
    return null;
  } catch {
    return "badMatcher";
  }
}

export function validateHookCommand(cmd: HookCommandDraft): HookWarning | null {
  if (isOpaqueHook(cmd)) return null;
  if (!cmd.command.trim()) return "emptyCommand";
  if (cmd.timeout !== undefined && (!Number.isFinite(cmd.timeout) || cmd.timeout <= 0))
    return "badTimeout";
  return null;
}

// ── IPC input hardening ──────────────────────────────────────────────────────

/** Coerce an untrusted (IPC) value into a draft; returns null when the shape is wrong. */
export function sanitizeClaudeSettingsDraft(input: unknown): ClaudeSettingsDraft | null {
  if (!isRecord(input) || !isRecord(input["permissions"]) || !Array.isArray(input["hooks"]))
    return null;
  const p = input["permissions"];
  const permissions: PermissionsDraft = {
    allow: stringList(p["allow"]),
    ask: stringList(p["ask"]),
    deny: stringList(p["deny"]),
    defaultMode: typeof p["defaultMode"] === "string" ? p["defaultMode"] : "",
    additionalDirectories: stringList(p["additionalDirectories"]),
  };
  const hooks: HooksDraft = [];
  for (const ev of input["hooks"]) {
    if (!isRecord(ev) || typeof ev["event"] !== "string" || !Array.isArray(ev["groups"]))
      return null;
    const groups: HookGroupDraft[] = [];
    for (const g of ev["groups"]) {
      if (!isRecord(g) || !Array.isArray(g["commands"])) return null;
      const commands: HookCommandDraft[] = [];
      for (const c of g["commands"]) {
        if (!isRecord(c) || typeof c["command"] !== "string") return null;
        commands.push({
          command: c["command"],
          timeout: typeof c["timeout"] === "number" ? c["timeout"] : undefined,
          extra: isRecord(c["extra"]) ? c["extra"] : {},
        });
      }
      groups.push({
        matcher: typeof g["matcher"] === "string" ? g["matcher"] : "",
        commands,
        extra: isRecord(g["extra"]) ? g["extra"] : {},
      });
    }
    hooks.push({ event: ev["event"], groups });
  }
  return { permissions, hooks };
}

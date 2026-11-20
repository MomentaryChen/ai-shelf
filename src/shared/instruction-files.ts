/**
 * Pure catalogue + sync planning for agent instruction files (CLAUDE.md,
 * AGENTS.md, GEMINI.md, `.cursor/rules/*.mdc`, …).
 *
 * No `node:` imports — the renderer bundles the types and helpers, and the
 * main process resolves real paths by passing in home / project roots and the
 * platform's path separator. Reader lists mirror the provider candidate lists
 * in `src/inventory/*.ts`; keep them in sync when a provider learns a new file.
 */

export type InstructionScope = "global" | "project";

export type InstructionKindId =
  | "claude-global"
  | "gemini-global"
  | "copilot-global"
  | "opencode-global"
  | "claude-project"
  | "claude-dir-project"
  | "claude-local-project"
  | "agents-project"
  | "gemini-project"
  | "copilot-project"
  | "cursorrules-project"
  | "cursor-rule"
  | "codex-project"
  | "opencode-project"
  | "aider-conventions-project"
  | "aider-md-project";

export interface InstructionKind {
  id: InstructionKindId;
  scope: InstructionScope;
  /** Display path, e.g. `~/.claude/CLAUDE.md` or `.cursor/rules/*.mdc`. */
  label: string;
  /** Inventory tool ids that read this file. */
  readers: string[];
  /** Directory kind: each matching file under the directory is its own item. */
  directory?: boolean;
}

/** Ordered catalogue (UI order within each scope). */
export const INSTRUCTION_KINDS: readonly InstructionKind[] = [
  { id: "claude-global", scope: "global", label: "~/.claude/CLAUDE.md", readers: ["claude"] },
  { id: "gemini-global", scope: "global", label: "~/.gemini/GEMINI.md", readers: ["gemini"] },
  {
    id: "copilot-global",
    scope: "global",
    label: "~/.copilot/copilot-instructions.md",
    readers: ["copilot"],
  },
  {
    id: "opencode-global",
    scope: "global",
    label: "~/.config/opencode/AGENTS.md",
    readers: ["opencode"],
  },
  {
    id: "agents-project",
    scope: "project",
    label: "AGENTS.md",
    readers: ["codex", "cursor", "gemini", "copilot", "aider", "crush", "goose", "opencode"],
  },
  {
    id: "claude-project",
    scope: "project",
    label: "CLAUDE.md",
    readers: ["claude", "copilot", "crush", "goose"],
  },
  { id: "claude-dir-project", scope: "project", label: ".claude/CLAUDE.md", readers: ["claude"] },
  { id: "claude-local-project", scope: "project", label: "CLAUDE.local.md", readers: ["claude"] },
  { id: "gemini-project", scope: "project", label: "GEMINI.md", readers: ["gemini", "copilot"] },
  {
    id: "copilot-project",
    scope: "project",
    label: ".github/copilot-instructions.md",
    readers: ["copilot"],
  },
  { id: "cursorrules-project", scope: "project", label: ".cursorrules", readers: ["cursor"] },
  {
    id: "cursor-rule",
    scope: "project",
    label: ".cursor/rules/*.mdc",
    readers: ["cursor"],
    directory: true,
  },
  { id: "codex-project", scope: "project", label: "CODEX.md", readers: ["codex"] },
  { id: "opencode-project", scope: "project", label: "OPENCODE.md", readers: ["opencode"] },
  { id: "aider-conventions-project", scope: "project", label: "CONVENTIONS.md", readers: ["aider"] },
  { id: "aider-md-project", scope: "project", label: ".aider.md", readers: ["aider"] },
];

export function getInstructionKind(id: string): InstructionKind | undefined {
  return INSTRUCTION_KINDS.find((k) => k.id === id);
}

/** Roots the main process resolves (env overrides already applied). */
export interface InstructionRoots {
  /** `$CLAUDE_CONFIG_DIR` or `~/.claude`. */
  claudeDir: string;
  /** `~/.gemini`. */
  geminiDir: string;
  /** `$COPILOT_HOME` or `~/.copilot`. */
  copilotDir: string;
  /** `$XDG_CONFIG_HOME/opencode` or `~/.config/opencode`. */
  opencodeDir: string;
  /** Chosen project directory (absolute), or null when none is chosen. */
  projectDir: string | null;
  /** Path separator for the platform (`\\` on win32). */
  sep: string;
}

export function joinPath(sep: string, ...parts: string[]): string {
  const trimmed = parts
    .filter((p) => p.length > 0)
    .map((p, i) => {
      let s = p.replace(/[\\/]+/g, sep);
      if (i > 0) s = s.replace(/^[\\/]+/, "");
      if (i < parts.length - 1) s = s.replace(/[\\/]+$/, "");
      return s;
    });
  return trimmed.join(sep);
}

/** Directory holding Cursor rule files for the project. */
export function cursorRulesDir(roots: InstructionRoots): string | null {
  return roots.projectDir ? joinPath(roots.sep, roots.projectDir, ".cursor", "rules") : null;
}

/**
 * Absolute path of a single-file kind, or null for directory kinds and for
 * project kinds when no project is chosen.
 */
export function resolveKindPath(kindId: InstructionKindId, roots: InstructionRoots): string | null {
  const j = (...parts: string[]) => joinPath(roots.sep, ...parts);
  const p = roots.projectDir;
  switch (kindId) {
    case "claude-global":
      return j(roots.claudeDir, "CLAUDE.md");
    case "gemini-global":
      return j(roots.geminiDir, "GEMINI.md");
    case "copilot-global":
      return j(roots.copilotDir, "copilot-instructions.md");
    case "opencode-global":
      return j(roots.opencodeDir, "AGENTS.md");
    case "cursor-rule":
      return null;
  }
  if (!p) return null;
  switch (kindId) {
    case "agents-project":
      return j(p, "AGENTS.md");
    case "claude-project":
      return j(p, "CLAUDE.md");
    case "claude-dir-project":
      return j(p, ".claude", "CLAUDE.md");
    case "claude-local-project":
      return j(p, "CLAUDE.local.md");
    case "gemini-project":
      return j(p, "GEMINI.md");
    case "copilot-project":
      return j(p, ".github", "copilot-instructions.md");
    case "cursorrules-project":
      return j(p, ".cursorrules");
    case "codex-project":
      return j(p, "CODEX.md");
    case "opencode-project":
      return j(p, "OPENCODE.md");
    case "aider-conventions-project":
      return j(p, "CONVENTIONS.md");
    case "aider-md-project":
      return j(p, ".aider.md");
  }
  return null;
}

/**
 * A file reference sent over IPC. The renderer never sends absolute paths:
 * the main process resolves `{kindId, rulePath}` against the catalogue, so
 * the write surface is limited to the catalogue's file names.
 */
export interface InstructionRef {
  kindId: InstructionKindId;
  /** For `cursor-rule` only: path relative to `.cursor/rules`, `/`-separated. */
  rulePath?: string;
}

export const CURSOR_RULE_EXTENSIONS = [".mdc", ".md"] as const;

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/**
 * Validate a rule path relative to `.cursor/rules`: forward-slash segments, no
 * `..` / `.` / empty segments, no drive letters or absolute roots, a safe file
 * name and an allowed extension. Returns the normalized path or null.
 */
export function normalizeRulePath(rel: string): string | null {
  if (typeof rel !== "string") return null;
  const s = rel.replace(/\\/g, "/").trim();
  if (!s || s.startsWith("/") || /^[a-zA-Z]:/.test(s) || s.length > 200) return null;
  const segs = s.split("/");
  for (const seg of segs) {
    if (!seg || seg === "." || seg === "..") return null;
    if (/[<>:"|?*]/.test(seg) || hasControlChar(seg)) return null;
    if (/[. ]$/.test(seg)) return null;
  }
  const base = (segs.at(-1) ?? "").toLowerCase();
  const ext = CURSOR_RULE_EXTENSIONS.find((e) => base.endsWith(e));
  if (!ext || base.length === ext.length) return null; // need a name before the extension
  return segs.join("/");
}

/** Resolve an IPC ref to an absolute path, or null when it is not allowed. */
export function resolveInstructionRef(ref: unknown, roots: InstructionRoots): string | null {
  if (!ref || typeof ref !== "object") return null;
  const { kindId, rulePath } = ref as { kindId?: unknown; rulePath?: unknown };
  if (typeof kindId !== "string") return null;
  const kind = getInstructionKind(kindId);
  if (!kind) return null;
  if (kind.id === "cursor-rule") {
    const dir = cursorRulesDir(roots);
    const rel = typeof rulePath === "string" ? normalizeRulePath(rulePath) : null;
    if (!dir || !rel) return null;
    return joinPath(roots.sep, dir, ...rel.split("/"));
  }
  return resolveKindPath(kind.id, roots);
}

/** Stable key for a ref (renderer list keys / selection). */
export function instructionRefKey(ref: InstructionRef): string {
  return ref.kindId === "cursor-rule" ? `cursor-rule:${ref.rulePath ?? ""}` : ref.kindId;
}

/** Turn an arbitrary name into a safe `.mdc` rule file name. */
export function cursorRuleFileName(name: string): string {
  const base = name
    .replace(/\.(mdc|md)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${base || "rules"}.mdc`;
}

/** Default rule file name when syncing a non-rule source into Cursor rules. */
export function cursorRuleNameForSource(source: InstructionRef): string {
  if (source.kindId === "cursor-rule" && source.rulePath) {
    return normalizeRulePath(source.rulePath) ?? "rules.mdc";
  }
  const kind = getInstructionKind(source.kindId);
  const file = (kind?.label ?? "rules").split("/").pop() ?? "rules";
  const stem = file.replace(/^\./, "").replace(/\.md$/i, "");
  const suffix = kind?.scope === "global" ? "-global" : "";
  return cursorRuleFileName(`${stem}${suffix}`);
}

// --- Front-matter ---

export interface FrontMatterSplit {
  /** The front-matter block including both `---` fences and its trailing newline, or null. */
  frontMatter: string | null;
  body: string;
}

/**
 * Split a leading YAML front-matter block (`---` … `---`). Byte-preserving:
 * `frontMatter + body === text`. An optional BOM is kept with the front-matter.
 */
export function splitFrontMatter(text: string): FrontMatterSplit {
  const m = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { frontMatter: null, body: text };
  return { frontMatter: m[0], body: text.slice(m[0].length) };
}

export function isCursorRuleRef(ref: InstructionRef): boolean {
  return ref.kindId === "cursor-rule";
}

/** Front-matter used for a brand-new Cursor rule synced from a non-rule source. */
export function defaultCursorRuleFrontMatter(description: string, eol = "\n"): string {
  const safe = description.replace(/[\r\n]+/g, " ").trim();
  return `---${eol}description: ${safe}${eol}alwaysApply: true${eol}---${eol}`;
}

/**
 * Content to write into a target when syncing from `sourceContent`.
 *
 * Rule: the source is copied verbatim (front-matter included), except when the
 * target is a Cursor rule and the source has no front-matter of its own —
 *  - an existing rule keeps its own front-matter and only the body is replaced;
 *  - a new rule gets a default `alwaysApply: true` block so Cursor applies it.
 * Line endings and BOMs are never normalized.
 */
export function buildSyncedContent(opts: {
  sourceContent: string;
  sourceLabel: string;
  target: InstructionRef;
  /** Current target content, or null when the file does not exist. */
  targetContent: string | null;
}): string {
  const { sourceContent, target, targetContent } = opts;
  if (!isCursorRuleRef(target)) return sourceContent;
  const src = splitFrontMatter(sourceContent);
  if (src.frontMatter) return sourceContent;
  if (targetContent != null) {
    const tgt = splitFrontMatter(targetContent);
    if (tgt.frontMatter) return tgt.frontMatter + sourceContent;
    return sourceContent;
  }
  const eol = sourceContent.includes("\r\n") ? "\r\n" : "\n";
  return defaultCursorRuleFrontMatter(`Synced from ${opts.sourceLabel}`, eol) + sourceContent;
}

// --- Sync planning ---

export type InstructionSyncAction = "create" | "overwrite" | "unchanged" | "blocked";

export interface InstructionSyncTargetState {
  ref: InstructionRef;
  /** Display path for the preview. */
  path: string;
  /** Current content, or null when the file does not exist. */
  content: string | null;
}

export interface InstructionSyncPlanItem {
  ref: InstructionRef;
  path: string;
  action: InstructionSyncAction;
  /** Current content ("" when missing). */
  currentContent: string;
  /** Content that will be written (equals current for unchanged / blocked). */
  nextContent: string;
  reason?: "same-as-source" | "duplicate-target";
}

/**
 * Plan a sync from one source into several targets. Pure: callers read files
 * before and write `create` / `overwrite` items after confirmation.
 * "Unchanged" uses exact string equality (no CRLF / whitespace folding).
 */
export function planInstructionSync(opts: {
  source: InstructionRef;
  sourcePath: string;
  sourceContent: string;
  sourceLabel: string;
  targets: InstructionSyncTargetState[];
  /** Case-insensitive path comparison (win32). */
  caseInsensitive?: boolean;
}): InstructionSyncPlanItem[] {
  const norm = (p: string) => (opts.caseInsensitive ? p.toLowerCase() : p);
  const seen = new Set<string>([norm(opts.sourcePath)]);
  const out: InstructionSyncPlanItem[] = [];
  for (const target of opts.targets) {
    const current = target.content ?? "";
    const key = norm(target.path);
    if (key === norm(opts.sourcePath)) {
      out.push({
        ref: target.ref,
        path: target.path,
        action: "blocked",
        currentContent: current,
        nextContent: current,
        reason: "same-as-source",
      });
      continue;
    }
    if (seen.has(key)) {
      out.push({
        ref: target.ref,
        path: target.path,
        action: "blocked",
        currentContent: current,
        nextContent: current,
        reason: "duplicate-target",
      });
      continue;
    }
    seen.add(key);
    const next = buildSyncedContent({
      sourceContent: opts.sourceContent,
      sourceLabel: opts.sourceLabel,
      target: target.ref,
      targetContent: target.content,
    });
    const action: InstructionSyncAction =
      target.content == null ? "create" : target.content === next ? "unchanged" : "overwrite";
    out.push({ ref: target.ref, path: target.path, action, currentContent: current, nextContent: next });
  }
  return out;
}

/** Small non-cryptographic hash (FNV-1a, 32-bit) to detect edits between preview and apply. */
export function contentFingerprint(content: string | null): string {
  if (content == null) return "missing";
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${String(content.length)}:${h.toString(16)}`;
}

// --- IPC payload types ---

export interface InstructionFileInfo {
  ref: InstructionRef;
  kindId: InstructionKindId;
  scope: InstructionScope;
  path: string;
  /** Catalogue label, or `.cursor/rules/<rulePath>` for rule files. */
  label: string;
  readers: string[];
  exists: boolean;
  size: number | null;
  mtimeMs: number | null;
}

export interface InstructionScanResult {
  projectDir: string | null;
  /** Error when the requested project directory is not usable. */
  projectError?: string;
  files: InstructionFileInfo[];
  /** Absolute `.cursor/rules` directory, or null without a project. */
  cursorRulesDir: string | null;
}

export interface InstructionPreviewItem extends InstructionSyncPlanItem {
  /** Fingerprint of the target content seen by the preview. */
  fingerprint: string;
}

export interface InstructionPreviewResult {
  ok: boolean;
  error?: string;
  sourcePath?: string;
  sourceFingerprint?: string;
  items: InstructionPreviewItem[];
}

export interface InstructionApplyResultItem {
  ref: InstructionRef;
  path: string;
  status: "written" | "skipped" | "stale" | "error";
  backupPath?: string | null;
  error?: string;
}

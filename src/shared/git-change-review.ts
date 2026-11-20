/**
 * Pure helpers for "agent change review": which files changed in a pane's
 * repo since a baseline snapshot, their diffs, and how to revert one.
 * String-only (no node imports) so the renderer can import the types and
 * tests run the same on every host OS.
 */

export type ChangeStatus = "A" | "M" | "D";

export type ChangedFile = {
  /** Repo-root-relative path with forward slashes. */
  path: string;
  status: ChangeStatus;
  /** Submodule pointer (mode 160000) — listed, never reverted. */
  gitlink: boolean;
};

export type ChangeReviewErrorCode =
  | "remote"
  | "unsupported-cwd"
  | "not-repo"
  | "git-missing"
  | "no-baseline"
  | "not-changed"
  | "invalid-path"
  | "gitlink"
  | "git-failed";

export type ChangeReviewError = { ok: false; code: ChangeReviewErrorCode; error?: string };

export type ChangeReviewBaselineInfo = {
  /** When the baseline was taken (ms since epoch). */
  at: number;
  /** Short HEAD SHA at baseline time, or null on an unborn branch. */
  head: string | null;
  /** Repo top level (native display path). */
  toplevel: string;
};

export type ChangeReviewListResult =
  | {
      ok: true;
      baseline: ChangeReviewBaselineInfo;
      /** Tree of the working tree right now; pass back to fetch diffs that match this list. */
      snapshot: string;
      files: ChangedFile[];
    }
  | ChangeReviewError;

export type ChangeReviewDiffResult =
  | { ok: true; diff: string; truncated: boolean }
  | ChangeReviewError;

export type ChangeReviewActionResult = { ok: true } | ChangeReviewError;

export type ChangeReviewRequest = {
  /** PTY session id of the pane — a respawned pane gets a new baseline. */
  sessionId: string;
  cwd: string;
};

/**
 * A remote (SSH) pane cwd looks like `[user@]host:dir`; its repo lives on
 * another machine, so local git must not touch it. Same shape as the
 * renderer's `isRemotePaneCwd` (drive letters are one character and never match).
 */
export function isRemoteCwd(cwd: string): boolean {
  return /^[^\\/:\s]{2,}:/u.test(cwd.trim());
}

/** Validate a 40/64-char object id before putting it on git argv. */
export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

/**
 * Accept only plain repo-relative paths: no absolute / drive / UNC prefixes,
 * no `.` / `..` segments, no control characters, no leading `-`.
 */
export function isSafeRepoPath(path: unknown): path is string {
  if (typeof path !== "string" || !path || path.length > 4096) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(path)) return false;
  if (path.startsWith("-") || path.startsWith("/") || path.startsWith("\\")) return false;
  if (/^[A-Za-z]:/u.test(path)) return false;
  return path.split(/[\\/]/u).every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

const GITLINK_MODE = "160000";

/**
 * Parse `git diff-tree -r -z --no-renames <a> <b>` (raw format):
 * `:<oldmode> <newmode> <oldsha> <newsha> <status>\0<path>\0` repeated.
 * Type changes (`T`) count as modifications; anything unknown is skipped.
 */
export function parseDiffTreeRaw(stdout: string): ChangedFile[] {
  const parts = stdout.split("\0");
  const out: ChangedFile[] = [];
  for (let i = 0; i < parts.length; i++) {
    const meta = (parts.at(i) ?? "").replace(/^[\r\n]+/u, "");
    if (!meta.startsWith(":")) continue;
    const path = parts[i + 1];
    i += 1;
    if (!path) continue;
    const fields = meta.slice(1).split(" ");
    if (fields.length < 5) continue;
    const [oldMode, newMode] = fields;
    const rawStatus = fields.at(4) ?? "";
    const letter = rawStatus.charAt(0);
    let status: ChangeStatus;
    if (letter === "A") status = "A";
    else if (letter === "D") status = "D";
    else if (letter === "M" || letter === "T") status = "M";
    else continue;
    out.push({
      path,
      status,
      gitlink: oldMode === GITLINK_MODE || newMode === GITLINK_MODE,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Parse `git ls-tree -z <tree> -- <path>`: the entry's mode and type, or null
 * when the path did not exist in the tree.
 */
export function parseLsTreeEntry(
  stdout: string,
  path: string,
): { mode: string; type: string } | null {
  for (const rec of stdout.split("\0")) {
    const tab = rec.indexOf("\t");
    if (tab < 0) continue;
    if (rec.slice(tab + 1) !== path) continue;
    const [mode, type] = rec.slice(0, tab).split(" ");
    if (!mode || !type) continue;
    return { mode, type };
  }
  return null;
}

export type RevertAction =
  | { kind: "restore" }
  | { kind: "delete" }
  | { kind: "refuse"; code: "gitlink" | "not-changed" };

/**
 * What reverting `path` to the baseline means. `changed` is the file as found
 * in a fresh baseline-vs-now comparison (null when it is not changed);
 * `baselineEntry` is what the baseline tree holds at that path.
 */
export function decideRevertAction(
  changed: ChangedFile | null,
  baselineEntry: { mode: string; type: string } | null,
): RevertAction {
  if (!changed) return { kind: "refuse", code: "not-changed" };
  if (changed.gitlink || baselineEntry?.mode === GITLINK_MODE) {
    return { kind: "refuse", code: "gitlink" };
  }
  if (!baselineEntry || baselineEntry.type !== "blob") return { kind: "delete" };
  return { kind: "restore" };
}

export type UnifiedDiffLine = {
  type: "add" | "remove" | "context" | "hunk" | "note";
  text: string;
  oldNo: number | null;
  newNo: number | null;
};

export type ParsedUnifiedDiff = {
  binary: boolean;
  lines: UnifiedDiffLine[];
  added: number;
  removed: number;
};

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u;

/**
 * Parse one file's `git diff` output into display rows. The `diff --git` /
 * `index` / `---` / `+++` header is dropped; hunk headers and
 * `\ No newline at end of file` notes are kept as their own row types.
 */
export function parseUnifiedDiff(text: string): ParsedUnifiedDiff {
  const lines: UnifiedDiffLine[] = [];
  let binary = false;
  let added = 0;
  let removed = 0;
  let inHunk = false;
  let oldNo = 0;
  let newNo = 0;
  const raw = text.split("\n");
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
  for (const rawLine of raw) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const hunk = HUNK_RE.exec(line);
    if (hunk) {
      inHunk = true;
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      lines.push({ type: "hunk", text: line, oldNo: null, newNo: null });
      continue;
    }
    if (!inHunk) {
      if (/^Binary files .* differ$/u.test(line) || line === "GIT binary patch") binary = true;
      continue;
    }
    if (line.startsWith("diff --git ")) {
      inHunk = false;
      continue;
    }
    const head = line.charAt(0);
    const body = line.slice(1);
    if (head === "+") {
      lines.push({ type: "add", text: body, oldNo: null, newNo });
      newNo += 1;
      added += 1;
    } else if (head === "-") {
      lines.push({ type: "remove", text: body, oldNo, newNo: null });
      oldNo += 1;
      removed += 1;
    } else if (head === "\\") {
      lines.push({ type: "note", text: line, oldNo: null, newNo: null });
    } else {
      lines.push({ type: "context", text: body, oldNo, newNo });
      oldNo += 1;
      newNo += 1;
    }
  }
  return { binary, lines, added, removed };
}

/** Cut a long diff at a line boundary so the renderer stays responsive. */
export function truncateDiff(text: string, maxLines: number): { diff: string; truncated: boolean } {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) !== 10) continue;
    count += 1;
    if (count >= maxLines) return { diff: text.slice(0, i + 1), truncated: true };
  }
  return { diff: text, truncated: false };
}

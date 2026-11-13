/**
 * Pure helpers for pane git awareness and "new pane in a git worktree".
 * String-only (no node:path) so the renderer can import it and tests behave
 * the same on every host OS.
 */

import { isValidWslDistroName } from "./wsl-paths.js";

/** What the status bar / pane header shows for one cwd. */
export type GitCwdInfo = {
  /** Branch name, or the short SHA when HEAD is detached. */
  branch: string;
  detached: boolean;
  /** True when the cwd is inside a linked worktree (`git worktree add`), not the main checkout. */
  isLinkedWorktree: boolean;
  /** Null when the dirty probe timed out or failed. */
  dirty: boolean | null;
  /** Top of the current worktree. */
  toplevel: string;
  /** Root of the main worktree (parent of the shared `.git`). */
  mainRoot: string;
  /** True when git ran inside a WSL distro. */
  wsl: boolean;
};

export type GitWorktreeAddRequest = {
  cwd: string;
  branch: string;
  /** Start point for a new branch; ignored when checking out an existing branch. */
  base?: string;
  /** Check out an existing branch instead of creating one. */
  useExisting?: boolean;
};

export type GitWorktreeAddErrorCode =
  | "not-repo"
  | "unsupported-cwd"
  | "git-missing"
  | "invalid-branch"
  | "invalid-base"
  | "branch-exists"
  | "path-exists"
  | "git-failed";

export type GitWorktreeAddResult =
  | { ok: true; path: string; branch: string; createdBranch: boolean }
  | { ok: false; code: GitWorktreeAddErrorCode; error?: string; path?: string };

/** Where git should run for a pane cwd. */
export type GitCwdTarget =
  | { kind: "native"; path: string }
  | { kind: "wsl"; distro: string; linuxPath: string };

const WSL_UNC_RE = /^\\\\(?:wsl\$|wsl\.localhost)\\([^\\/]+)(.*)$/iu;
const WIN_DRIVE_RE = /^[A-Za-z]:[\\/]/u;

/**
 * Decide how (and whether) to run git for a pane cwd.
 *
 * - Windows host: drive paths run the Windows `git`; `\\wsl$\<distro>\…` /
 *   `\\wsl.localhost\<distro>\…` run `git` inside that distro via `wsl.exe`.
 *   Every other UNC path (network shares, and the `\\<linux-host>\home\…`
 *   shape a WSL bash OSC 7 report turns into on Windows) and rootless Linux
 *   paths return null — probing them could hang on a network lookup or guess
 *   the wrong distro.
 * - Other hosts: absolute POSIX paths run the native `git`.
 */
export function classifyGitCwd(cwd: string, hostPlatform: string): GitCwdTarget | null {
  const trimmed = cwd.trim();
  if (!trimmed) return null;
  if (hostPlatform === "win32") {
    const unc = WSL_UNC_RE.exec(trimmed);
    if (unc) {
      const distro = unc[1] ?? "";
      if (!isValidWslDistroName(distro)) return null;
      const rest = (unc[2] ?? "").replace(/\\/gu, "/");
      const linuxPath = rest && rest !== "/" ? (rest.startsWith("/") ? rest : `/${rest}`) : "/";
      return { kind: "wsl", distro, linuxPath };
    }
    if (WIN_DRIVE_RE.test(trimmed)) return { kind: "native", path: trimmed };
    return null;
  }
  if (trimmed.startsWith("/")) return { kind: "native", path: trimmed };
  return null;
}

function isWindowsStyle(path: string): boolean {
  return /^[A-Za-z]:/u.test(path);
}

function isAbsoluteGitPath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/u.test(path);
}

/** Collapse `.` / `..` segments and use forward slashes; keeps a leading `/` or `C:`. */
export function normalizeGitPath(path: string): string {
  const slashed = path.trim().replace(/\\/gu, "/");
  const drive = /^([A-Za-z]):/u.exec(slashed);
  const prefix = drive ? `${drive[1]!.toUpperCase()}:` : "";
  const body = drive ? slashed.slice(2) : slashed;
  const rooted = body.startsWith("/");
  const out: string[] = [];
  for (const seg of body.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!rooted) out.push("..");
      continue;
    }
    out.push(seg);
  }
  const joined = out.join("/");
  if (rooted) return `${prefix}/${joined}`;
  return prefix ? `${prefix}${joined}` : joined || ".";
}

/** Resolve a path git printed (absolute or relative to `base`). */
export function resolveGitPath(base: string, path: string): string {
  const p = path.trim();
  if (isAbsoluteGitPath(p)) return normalizeGitPath(p);
  return normalizeGitPath(`${base.replace(/[\\/]+$/u, "")}/${p}`);
}

function samePath(a: string, b: string): boolean {
  const na = normalizeGitPath(a);
  const nb = normalizeGitPath(b);
  return isWindowsStyle(na) || isWindowsStyle(nb)
    ? na.toLowerCase() === nb.toLowerCase()
    : na === nb;
}

function basenameOf(path: string): string {
  const n = normalizeGitPath(path);
  const idx = n.lastIndexOf("/");
  return idx >= 0 ? n.slice(idx + 1) : n;
}

function dirnameOf(path: string): string {
  const n = normalizeGitPath(path);
  const idx = n.lastIndexOf("/");
  if (idx < 0) return ".";
  if (idx === 0) return "/";
  const parent = n.slice(0, idx);
  return /^[A-Za-z]:$/u.test(parent) ? `${parent}/` : parent;
}

export type GitRevParseProbe = {
  toplevel: string;
  gitDir: string;
  commonDir: string;
  isLinkedWorktree: boolean;
  mainRoot: string;
};

/**
 * Parse `git rev-parse --show-toplevel --git-dir --git-common-dir` (one path
 * per line, the last two possibly relative to `cwd`).
 */
export function parseRevParseProbe(stdout: string, cwd: string): GitRevParseProbe | null {
  const lines = stdout
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;
  const toplevel = normalizeGitPath(lines[0]!);
  const gitDir = resolveGitPath(cwd, lines[1]!);
  const commonDir = resolveGitPath(cwd, lines[2]!);
  return {
    toplevel,
    gitDir,
    commonDir,
    isLinkedWorktree: !samePath(gitDir, commonDir),
    mainRoot: mainWorktreeRoot(commonDir, toplevel),
  };
}

/** Main checkout root: the parent of `<root>/.git`; a bare repo dir otherwise. */
export function mainWorktreeRoot(commonDir: string, toplevel: string): string {
  const common = normalizeGitPath(commonDir);
  if (basenameOf(common) === ".git") return dirnameOf(common);
  if (/\.git$/iu.test(basenameOf(common))) return common;
  return normalizeGitPath(toplevel);
}

/** Make a branch name safe as one path segment: `feat/login ui` → `feat-login-ui`. */
export function sanitizeBranchForPath(branch: string): string {
  const cleaned = branch
    .trim()
    .replace(/[\\/:*?"<>|\s]+/gu, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^[-.]+|[-.]+$/gu, "");
  return cleaned || "worktree";
}

/**
 * Default worktree path: sibling of the main checkout,
 * `<repoRoot>/../<repoName>-<sanitized-branch>`. Windows-style roots come
 * back with backslashes.
 */
export function deriveWorktreePath(mainRoot: string, branch: string): string {
  const root = normalizeGitPath(mainRoot).replace(/\/+$/u, "");
  const repoName = basenameOf(root).replace(/\.git$/iu, "") || "repo";
  const parent = dirnameOf(root).replace(/\/+$/u, "");
  const joined = `${parent}/${repoName}-${sanitizeBranchForPath(branch)}`;
  return isWindowsStyle(joined) ? joined.replace(/\//gu, "\\") : joined;
}

/** Convert git's forward-slash Windows output (`C:/a/b`) to a native display path. */
export function toNativeDisplayPath(path: string): string {
  const n = normalizeGitPath(path);
  return isWindowsStyle(n) ? n.replace(/\//gu, "\\") : n;
}

/** `git status --porcelain` output → dirty flag. */
export function parsePorcelainDirty(stdout: string): boolean {
  return stdout.split(/\r?\n/u).some((l) => l.trim().length > 0);
}

/**
 * Cheap pre-check before handing a ref to git argv: non-empty, no leading
 * `-` (option injection), no whitespace or control characters. Full rules
 * are enforced by `git check-ref-format --branch`.
 */
export function isSafeRefArg(ref: string): boolean {
  if (!ref || ref !== ref.trim()) return false;
  if (ref.startsWith("-")) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\s\u0000-\u001f\u007f]/u.test(ref);
}

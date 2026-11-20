import { execSync } from "node:child_process";

export interface GitBuildInfo {
  branch: string | null;
  commitShort: string | null;
  dirty: boolean;
}

function gitOutput(repoRoot: string, args: string[]): string | null {
  try {
    return execSync(["git", ...args].join(" "), {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Best-effort git metadata for build / dev identification (e.g. worktree branch). */
export function readGitBuildInfo(startDir: string): GitBuildInfo {
  const repoRoot = gitOutput(startDir, ["rev-parse", "--show-toplevel"]) ?? startDir;
  const branch = gitOutput(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const commitShort = gitOutput(repoRoot, ["rev-parse", "--short", "HEAD"]);
  const status = gitOutput(repoRoot, ["status", "--porcelain"]);
  return {
    branch: branch || null,
    commitShort: commitShort || null,
    dirty: Boolean(status),
  };
}

const gitBuildInfoCache = new Map<string, GitBuildInfo>();

/**
 * `readGitBuildInfo` memoized per directory for the life of the process.
 * It shells out four times (incl. `git status`), so window-title updates and
 * About/self-info requests must not re-run it. Branch / dirty flag reflect
 * the state at first read.
 */
export function readGitBuildInfoCached(startDir: string): GitBuildInfo {
  let info = gitBuildInfoCache.get(startDir);
  if (!info) {
    info = readGitBuildInfo(startDir);
    gitBuildInfoCache.set(startDir, info);
  }
  return info;
}

export function formatGitBuildLabel(info: GitBuildInfo): string | null {
  if (!info.branch) return null;
  const commit = info.commitShort ? `@${info.commitShort}` : "";
  const dirty = info.dirty ? "*" : "";
  return `${info.branch}${commit}${dirty}`;
}

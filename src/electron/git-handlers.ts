import { ipcMain } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import {
  classifyGitCwd,
  deriveWorktreePath,
  isSafeRefArg,
  parsePorcelainDirty,
  parseRevParseProbe,
  toNativeDisplayPath,
  type GitCwdInfo,
  type GitCwdTarget,
  type GitRevParseProbe,
  type GitWorktreeAddResult,
} from "../shared/git-worktree.js";
import { listRunningWslDistros } from "./wsl-exec.js";

const PROBE_TIMEOUT_MS = 2_500;
const DIRTY_TIMEOUT_MS = 1_500;
const WORKTREE_ADD_TIMEOUT_MS = 120_000;
/** Probes for the same cwd within this window share one result. */
const INFO_CACHE_MS = 2_000;
const WSL_RUNNING_CACHE_MS = 30_000;

type GitRun = {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** git (or wsl.exe) could not be started. */
  missing: boolean;
};

/**
 * Run git without a shell. Background probes pass `--no-optional-locks` so
 * they never take `index.lock` out from under an agent running git in a pane.
 */
function runGit(
  target: GitCwdTarget,
  args: string[],
  timeoutMs: number,
  opts?: { allowLocks?: boolean },
): Promise<GitRun> {
  const gitArgs = [
    ...(opts?.allowLocks ? [] : ["--no-optional-locks"]),
    "-C",
    target.kind === "wsl" ? target.linuxPath : target.path,
    ...args,
  ];
  const file = target.kind === "wsl" ? "wsl.exe" : "git";
  const argv = target.kind === "wsl" ? ["-d", target.distro, "-e", "git", ...gitArgs] : gitArgs;
  return new Promise((resolve) => {
    execFile(
      file,
      argv,
      {
        timeout: timeoutMs,
        windowsHide: true,
        shell: false,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
      },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ ok: true, stdout, stderr, missing: false });
          return;
        }
        const code = (err as NodeJS.ErrnoException).code;
        resolve({
          ok: false,
          stdout,
          stderr: stderr.replace(/\0/gu, "").trim() || err.message,
          missing: code === "ENOENT",
        });
      },
    );
  });
}

let wslRunning: { at: number; names: Promise<string[]> } | null = null;

/** Never boot a stopped distro just to draw a status bar segment. */
async function isWslDistroRunning(distro: string): Promise<boolean> {
  const now = Date.now();
  if (!wslRunning || now - wslRunning.at > WSL_RUNNING_CACHE_MS) {
    wslRunning = { at: now, names: listRunningWslDistros() };
  }
  const names = await wslRunning.names;
  return names.some((n) => n.toLowerCase() === distro.toLowerCase());
}

async function resolveTarget(cwd: unknown): Promise<GitCwdTarget | null> {
  if (typeof cwd !== "string") return null;
  const target = classifyGitCwd(cwd, platform());
  if (!target) return null;
  if (target.kind === "wsl" && !(await isWslDistroRunning(target.distro))) return null;
  return target;
}

async function probeRepo(target: GitCwdTarget): Promise<GitRevParseProbe | null> {
  const r = await runGit(
    target,
    ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"],
    PROBE_TIMEOUT_MS,
  );
  if (!r.ok) return null;
  return parseRevParseProbe(r.stdout, target.kind === "wsl" ? target.linuxPath : target.path);
}

async function readHead(
  target: GitCwdTarget,
): Promise<{ branch: string; detached: boolean } | null> {
  const sym = await runGit(
    target,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    PROBE_TIMEOUT_MS,
  );
  const name = sym.stdout.trim();
  if (sym.ok && name) return { branch: name, detached: false };
  const sha = await runGit(target, ["rev-parse", "--short", "HEAD"], PROBE_TIMEOUT_MS);
  const short = sha.stdout.trim();
  if (sha.ok && short) return { branch: short, detached: true };
  return null;
}

async function readDirty(target: GitCwdTarget): Promise<boolean | null> {
  const r = await runGit(target, ["status", "--porcelain", "-uno"], DIRTY_TIMEOUT_MS);
  return r.ok ? parsePorcelainDirty(r.stdout) : null;
}

async function computeGitInfo(cwd: unknown): Promise<GitCwdInfo | null> {
  const target = await resolveTarget(cwd);
  if (!target) return null;
  const probe = await probeRepo(target);
  if (!probe) return null;
  const [head, dirty] = await Promise.all([readHead(target), readDirty(target)]);
  if (!head) return null;
  return {
    branch: head.branch,
    detached: head.detached,
    isLinkedWorktree: probe.isLinkedWorktree,
    dirty,
    toplevel: toNativeDisplayPath(probe.toplevel),
    mainRoot: toNativeDisplayPath(probe.mainRoot),
    wsl: target.kind === "wsl",
  };
}

const infoCache = new Map<string, { at: number; result: Promise<GitCwdInfo | null> }>();

function getGitInfo(cwd: unknown): Promise<GitCwdInfo | null> {
  if (typeof cwd !== "string" || !cwd.trim()) return Promise.resolve(null);
  const key = cwd.trim();
  const now = Date.now();
  const hit = infoCache.get(key);
  if (hit && now - hit.at < INFO_CACHE_MS) return hit.result;
  const result = computeGitInfo(key).catch(() => null);
  infoCache.set(key, { at: now, result });
  if (infoCache.size > 200) {
    for (const [k, v] of infoCache) {
      if (now - v.at >= INFO_CACHE_MS) infoCache.delete(k);
    }
  }
  return result;
}

function gitError(r: GitRun): GitWorktreeAddResult {
  if (r.missing) return { ok: false, code: "git-missing" };
  return { ok: false, code: "git-failed", error: r.stderr || r.stdout.trim() };
}

/**
 * `git worktree add` next to the main checkout. Never deletes, never forces:
 * an existing target path or branch is reported back instead.
 */
async function addWorktree(req: unknown): Promise<GitWorktreeAddResult> {
  if (!req || typeof req !== "object") return { ok: false, code: "not-repo" };
  const { cwd, branch, base, useExisting } = req as Record<string, unknown>;
  if (typeof cwd !== "string" || !cwd.trim()) return { ok: false, code: "not-repo" };
  const target = classifyGitCwd(cwd, platform());
  // WSL panes: the new pane's cwd would be a \\wsl$ UNC path, which the
  // Windows shells cannot start in — keep this native-only.
  if (!target || target.kind !== "native") return { ok: false, code: "unsupported-cwd" };

  const branchName = typeof branch === "string" ? branch.trim() : "";
  if (!isSafeRefArg(branchName)) return { ok: false, code: "invalid-branch" };
  const checked = await runGit(
    target,
    ["check-ref-format", "--branch", branchName],
    PROBE_TIMEOUT_MS,
  );
  if (checked.missing) return { ok: false, code: "git-missing" };
  if (!checked.ok) return { ok: false, code: "invalid-branch" };

  const probe = await probeRepo(target);
  if (!probe) return { ok: false, code: "not-repo" };

  const path = deriveWorktreePath(probe.mainRoot, branchName);
  if (existsSync(path)) return { ok: false, code: "path-exists", path };

  const exists = await runGit(
    target,
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    PROBE_TIMEOUT_MS,
  );
  const branchExists = exists.ok;

  let args: string[];
  if (branchExists) {
    if (useExisting !== true) return { ok: false, code: "branch-exists", path };
    args = ["worktree", "add", path, branchName];
  } else {
    args = ["worktree", "add", "-b", branchName, path];
    const baseRef = typeof base === "string" ? base.trim() : "";
    if (baseRef) {
      if (!isSafeRefArg(baseRef)) return { ok: false, code: "invalid-base" };
      const verified = await runGit(
        target,
        ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`],
        PROBE_TIMEOUT_MS,
      );
      if (!verified.ok) return { ok: false, code: "invalid-base" };
      args.push(baseRef);
    }
  }

  const added = await runGit(target, args, WORKTREE_ADD_TIMEOUT_MS, { allowLocks: true });
  if (!added.ok) return gitError(added);
  infoCache.clear();
  return { ok: true, path, branch: branchName, createdBranch: !branchExists };
}

export function registerGitHandlers(): void {
  ipcMain.handle("git-cwd-info", (_event, cwd: unknown) => getGitInfo(cwd));
  ipcMain.handle("git-worktree-add", (_event, req: unknown) => addWorktree(req));
}

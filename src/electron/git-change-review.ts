/**
 * "Agent change review": what changed in a pane's repo since a baseline.
 *
 * A baseline is a git tree of the whole working tree (tracked + untracked,
 * minus ignored files) built in a throwaway index — `GIT_INDEX_FILE` pointing
 * at a copy of the repo's index, then `git add -A` + `git write-tree`. This
 * never touches the real index, the working tree, refs or the stash list, and
 * unlike `git stash create` it also captures untracked files, so files that
 * already existed when the pane started are not blamed on the agent.
 *
 * Listing builds a second tree the same way and compares the two with
 * `git diff-tree`; a revert restores one path from the baseline tree (or
 * deletes it when the baseline did not have it).
 */
import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { copyFile, rm } from "node:fs/promises";
import { platform } from "node:os";
import {
  decideRevertAction,
  isObjectId,
  isRemoteCwd,
  isSafeRepoPath,
  parseDiffTreeRaw,
  parseLsTreeEntry,
  truncateDiff,
  type ChangeReviewActionResult,
  type ChangeReviewBaselineInfo,
  type ChangeReviewDiffResult,
  type ChangeReviewError,
  type ChangeReviewListResult,
} from "../shared/git-change-review.js";
import {
  normalizeGitPath,
  resolveGitPath,
  toNativeDisplayPath,
  type GitCwdTarget,
} from "../shared/git-worktree.js";
import {
  clearGitInfoCache,
  PROBE_TIMEOUT_MS,
  resolveTarget,
  runGit,
  type GitRun,
} from "./git-handlers.js";
import { runWsl } from "./wsl-exec.js";

/** `git add -A` hashes every changed / untracked file; big trees need time. */
const SNAPSHOT_TIMEOUT_MS = 60_000;
const DIFF_TIMEOUT_MS = 15_000;
const RESTORE_TIMEOUT_MS = 15_000;
const DIFF_MAX_BUFFER = 32 * 1024 * 1024;
const LIST_MAX_BUFFER = 16 * 1024 * 1024;
const DIFF_MAX_LINES = 4_000;
const MAX_BASELINES = 300;

type Repo = {
  /** Where git runs: the repo top level, so diff-tree paths line up with `-- <path>`. */
  target: GitCwdTarget;
  /** Top level as git prints it (`C:/x`, `/home/x`). */
  top: string;
  /** Identity of the repo across panes (distro + path, case-folded on Windows). */
  key: string;
};

type Baseline = { tree: string; head: string | null; at: number; toplevel: string };

/** `${sessionId}\0${repo.key}` → baseline. A respawn or `cd` into another repo starts fresh. */
const baselines = new Map<string, Baseline>();
const pendingBaselines = new Map<string, Promise<Baseline | ChangeReviewError>>();
const pendingSnapshots = new Map<string, Promise<string | ChangeReviewError>>();

function fail(code: ChangeReviewError["code"], error?: string): ChangeReviewError {
  return error ? { ok: false, code, error } : { ok: false, code };
}

function gitFail(r: GitRun): ChangeReviewError {
  if (r.missing) return fail("git-missing");
  return fail("git-failed", r.stderr || r.stdout.trim());
}

function isError(v: unknown): v is ChangeReviewError {
  return typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;
}

type ParsedReq = { sessionId: string; cwd: string; path?: unknown; snapshot?: unknown };

function parseReq(req: unknown): ParsedReq | ChangeReviewError {
  if (!req || typeof req !== "object") return fail("unsupported-cwd");
  const { sessionId, cwd, path, snapshot } = req as Record<string, unknown>;
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 200) {
    return fail("unsupported-cwd");
  }
  if (typeof cwd !== "string" || !cwd.trim()) return fail("unsupported-cwd");
  return { sessionId, cwd: cwd.trim(), path, snapshot };
}

async function openRepo(cwd: string): Promise<Repo | ChangeReviewError> {
  if (isRemoteCwd(cwd)) return fail("remote");
  const target = await resolveTarget(cwd);
  if (!target) return fail("unsupported-cwd");
  const r = await runGit(target, ["rev-parse", "--show-toplevel"], PROBE_TIMEOUT_MS);
  if (r.missing) return fail("git-missing");
  const out = r.stdout.trim();
  if (!r.ok || !out) return fail("not-repo");
  const top = normalizeGitPath(out);
  if (target.kind === "wsl") {
    return {
      target: { kind: "wsl", distro: target.distro, linuxPath: top },
      top,
      key: `wsl:${target.distro.toLowerCase()}:${top}`,
    };
  }
  return {
    target: { kind: "native", path: top },
    top,
    key: `native:${platform() === "win32" ? top.toLowerCase() : top}`,
  };
}

async function copyRepoFile(repo: Repo, from: string, to: string): Promise<boolean> {
  if (repo.target.kind === "wsl") {
    const r = await runWsl(["-d", repo.target.distro, "-e", "cp", "--", from, to]);
    return r.ok;
  }
  try {
    await copyFile(from, to);
    return true;
  } catch {
    return false;
  }
}

async function removeRepoFile(repo: Repo, path: string): Promise<boolean> {
  if (repo.target.kind === "wsl") {
    const r = await runWsl(["-d", repo.target.distro, "-e", "rm", "-f", "--", path]);
    return r.ok;
  }
  try {
    await rm(path, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** A failed `add --ignore-errors` that only reported per-path errors (no fatal, no timeout). */
function isOnlySkippedPaths(r: GitRun): boolean {
  if (r.missing || r.timedOut) return false;
  const lines = r.stderr
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    lines.some((l) => l.startsWith("error:")) && lines.every((l) => /^(?:error|warning):/u.test(l))
  );
}

/** Tree of the working tree as `git add -A` would stage it, without touching the real index. */
async function buildSnapshot(repo: Repo): Promise<string | ChangeReviewError> {
  const ip = await runGit(repo.target, ["rev-parse", "--git-path", "index"], PROBE_TIMEOUT_MS);
  if (!ip.ok) return gitFail(ip);
  const indexPath = resolveGitPath(repo.top, ip.stdout.trim());
  const tmp = `${indexPath}.ai-shelf-review-${randomUUID().slice(0, 8)}`;
  try {
    // Seeding from the real index keeps its stat cache, so unchanged files
    // are not re-hashed. No index yet (fresh repo) is fine: git starts empty.
    await copyRepoFile(repo, indexPath, tmp);
    const add = await runGit(
      repo.target,
      ["-c", "core.safecrlf=false", "add", "-A", "--ignore-errors"],
      SNAPSHOT_TIMEOUT_MS,
      { allowLocks: true, indexFile: tmp },
    );
    // `--ignore-errors` keeps going past paths git cannot add (e.g. a nested
    // repo with no commit yet) and exits 1; those paths are just left out.
    if (!add.ok && !isOnlySkippedPaths(add)) return gitFail(add);
    const tree = await runGit(repo.target, ["write-tree"], SNAPSHOT_TIMEOUT_MS, {
      allowLocks: true,
      indexFile: tmp,
    });
    const sha = tree.stdout.trim();
    if (!tree.ok || !isObjectId(sha)) return gitFail(tree);
    return sha;
  } finally {
    await removeRepoFile(repo, tmp);
    await removeRepoFile(repo, `${tmp}.lock`);
  }
}

/** Concurrent snapshots of the same repo (several panes, quick refreshes) share one run. */
function snapshot(repo: Repo): Promise<string | ChangeReviewError> {
  const hit = pendingSnapshots.get(repo.key);
  if (hit) return hit;
  const job = buildSnapshot(repo)
    .catch((err: unknown) => fail("git-failed", err instanceof Error ? err.message : String(err)))
    .finally(() => pendingSnapshots.delete(repo.key));
  pendingSnapshots.set(repo.key, job);
  return job;
}

async function readHeadShort(repo: Repo): Promise<string | null> {
  const r = await runGit(repo.target, ["rev-parse", "--short", "HEAD"], PROBE_TIMEOUT_MS);
  const sha = r.stdout.trim();
  return r.ok && sha ? sha : null;
}

function rememberBaseline(key: string, baseline: Baseline): void {
  baselines.delete(key);
  baselines.set(key, baseline);
  while (baselines.size > MAX_BASELINES) {
    const oldest = baselines.keys().next().value;
    if (oldest === undefined) break;
    baselines.delete(oldest);
  }
}

function baselineKey(sessionId: string, repo: Repo): string {
  return `${sessionId}\0${repo.key}`;
}

async function ensureBaseline(
  sessionId: string,
  repo: Repo,
  reset: boolean,
): Promise<Baseline | ChangeReviewError> {
  const key = baselineKey(sessionId, repo);
  if (!reset) {
    const known = baselines.get(key);
    if (known) return known;
  }
  const pending = pendingBaselines.get(key);
  if (pending && !reset) return pending;
  const job = (async (): Promise<Baseline | ChangeReviewError> => {
    const [tree, head] = await Promise.all([snapshot(repo), readHeadShort(repo)]);
    if (isError(tree)) return tree;
    const baseline: Baseline = {
      tree,
      head,
      at: Date.now(),
      toplevel: toNativeDisplayPath(repo.top),
    };
    rememberBaseline(key, baseline);
    return baseline;
  })().finally(() => {
    if (pendingBaselines.get(key) === job) pendingBaselines.delete(key);
  });
  pendingBaselines.set(key, job);
  return job;
}

function baselineInfo(b: Baseline): ChangeReviewBaselineInfo {
  return { at: b.at, head: b.head, toplevel: b.toplevel };
}

async function changedFiles(repo: Repo, base: string, snap: string, path?: string) {
  const args = ["--literal-pathspecs", "diff-tree", "-r", "-z", "--no-renames", base, snap];
  if (path !== undefined) args.push("--", path);
  const r = await runGit(repo.target, args, DIFF_TIMEOUT_MS, { maxBuffer: LIST_MAX_BUFFER });
  if (!r.ok) return gitFail(r);
  return parseDiffTreeRaw(r.stdout);
}

type Opened = { req: ParsedReq; repo: Repo };

async function open(raw: unknown): Promise<Opened | ChangeReviewError> {
  const req = parseReq(raw);
  if (isError(req)) return req;
  const repo = await openRepo(req.cwd);
  if (isError(repo)) return repo;
  return { req, repo };
}

/** Take the pane's baseline now unless it already has one (idempotent). */
async function ensure(raw: unknown): Promise<ChangeReviewActionResult> {
  const o = await open(raw);
  if (isError(o)) return o;
  const b = await ensureBaseline(o.req.sessionId, o.repo, false);
  return isError(b) ? b : { ok: true };
}

async function list(raw: unknown): Promise<ChangeReviewListResult> {
  const o = await open(raw);
  if (isError(o)) return o;
  const base = await ensureBaseline(o.req.sessionId, o.repo, false);
  if (isError(base)) return base;
  const snap = await snapshot(o.repo);
  if (isError(snap)) return snap;
  const files = await changedFiles(o.repo, base.tree, snap);
  if (isError(files)) return files;
  return { ok: true, baseline: baselineInfo(base), snapshot: snap, files };
}

async function diff(raw: unknown): Promise<ChangeReviewDiffResult> {
  const o = await open(raw);
  if (isError(o)) return o;
  const { path, snapshot: snap } = o.req;
  if (!isSafeRepoPath(path) || !isObjectId(snap)) return fail("invalid-path");
  const base = baselines.get(baselineKey(o.req.sessionId, o.repo));
  if (!base) return fail("no-baseline");
  const r = await runGit(
    o.repo.target,
    [
      "--literal-pathspecs",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      base.tree,
      snap,
      "--",
      path,
    ],
    DIFF_TIMEOUT_MS,
    { maxBuffer: DIFF_MAX_BUFFER },
  );
  if (!r.ok) return gitFail(r);
  return { ok: true, ...truncateDiff(r.stdout, DIFF_MAX_LINES) };
}

/**
 * Put one path back the way it was at the baseline. The action is decided
 * here from a fresh comparison and the baseline tree — never from what the
 * renderer believes — so a stale list cannot delete a file that now matters.
 */
async function revert(raw: unknown): Promise<ChangeReviewActionResult> {
  const o = await open(raw);
  if (isError(o)) return o;
  const { path } = o.req;
  if (!isSafeRepoPath(path)) return fail("invalid-path");
  const base = baselines.get(baselineKey(o.req.sessionId, o.repo));
  if (!base) return fail("no-baseline");
  const snap = await snapshot(o.repo);
  if (isError(snap)) return snap;
  const files = await changedFiles(o.repo, base.tree, snap, path);
  if (isError(files)) return files;
  const changed = files.find((f) => f.path === path) ?? null;
  const ls = await runGit(
    o.repo.target,
    ["--literal-pathspecs", "ls-tree", "-z", base.tree, "--", path],
    PROBE_TIMEOUT_MS,
  );
  if (!ls.ok) return gitFail(ls);
  const action = decideRevertAction(changed, parseLsTreeEntry(ls.stdout, path));
  if (action.kind === "refuse") return fail(action.code);
  if (action.kind === "restore") {
    const r = await runGit(
      o.repo.target,
      ["--literal-pathspecs", "restore", `--source=${base.tree}`, "--worktree", "--", path],
      RESTORE_TIMEOUT_MS,
      { allowLocks: true },
    );
    if (!r.ok) return gitFail(r);
  } else {
    const removed = await removeRepoFile(o.repo, `${o.repo.top.replace(/\/+$/u, "")}/${path}`);
    if (!removed) return fail("git-failed", `Could not delete ${path}`);
  }
  clearGitInfoCache();
  return { ok: true };
}

async function reset(raw: unknown): Promise<ChangeReviewListResult> {
  const o = await open(raw);
  if (isError(o)) return o;
  const base = await ensureBaseline(o.req.sessionId, o.repo, true);
  if (isError(base)) return base;
  return { ok: true, baseline: baselineInfo(base), snapshot: base.tree, files: [] };
}

function guard<T>(fn: (raw: unknown) => Promise<T>) {
  return (_event: unknown, raw: unknown): Promise<T | ChangeReviewError> =>
    fn(raw).catch((err: unknown) =>
      fail("git-failed", err instanceof Error ? err.message : String(err)),
    );
}

export function registerChangeReviewHandlers(): void {
  ipcMain.handle("git-change-review-ensure", guard(ensure));
  ipcMain.handle("git-change-review-list", guard(list));
  ipcMain.handle("git-change-review-diff", guard(diff));
  ipcMain.handle("git-change-review-revert", guard(revert));
  ipcMain.handle("git-change-review-reset", guard(reset));
}

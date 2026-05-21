# Git worktree — reference (ai-shelf)

## Worktree root layout

All ai-shelf worktrees use a **fixed directory**:

```text
D:/projects/worktree/ai-shelf--<slug>
```

- **Root:** `D:/projects/worktree` — shared folder for worktrees (create with `New-Item -Force` if missing).
- **Prefix:** `ai-shelf--` — avoids collisions if other repos also use `D:/projects/worktree`.
- **Main checkout** stays at `D:/projects/ai-shelf` on `develop` (or whatever branch the user had).

Benefits:

- Keeps `node_modules` / `dist/` isolated per branch.
- Centralizes worktrees away from the main repo folder.
- Easy to find and delete old feature folders under one parent.

## Multiple worktrees

```powershell
git worktree list
```

Each line shows path, HEAD, branch. Maximum practical count is usually 2–4 (disk and `pnpm install` cost).

Adding a second feature:

```powershell
New-Item -ItemType Directory -Force -Path "D:/projects/worktree"
git worktree add -b feat/other "D:/projects/worktree/ai-shelf--feat-other" develop
```

## Sync with upstream before long work

```powershell
git fetch origin
git merge origin/develop
```

Resolve conflicts in the **worktree** directory, then commit.

## Native modules / install issues

If `pnpm install` fails on `node-pty` or `better-sqlite3`:

```powershell
pnpm install
node scripts/rebuild-native.mjs
```

Run from the worktree root, same as main repo [README.zh-TW.md](../../../README.zh-TW.md).

## Cursor / agent cwd

When this skill is active, prefer opening or stating the worktree path so tools and terminals default there. Wrong-directory edits are the most common mistake.

## AI Shelf: per-pane CWD + one-click folder

In **Terminal** mode, each embedded pane keeps its own `cwd` (saved with the profile layout). Use this when the main checkout stays on `develop` and a worktree runs on another branch:

| Action | Where | Effect |
|--------|--------|--------|
| **📁 Folder** (top bar) | Next to **+ Pane** | Pick a folder → spawn a new pane in that directory (e.g. `D:/projects/worktree/ai-shelf--feat-foo`) |
| **📁** (profile row) | Beside the default-tool **+** | Same, for that profile after activation |
| **CWD label** (pane header) | Click the folder name | Pick a new directory → respawn that pane in the new cwd |

Typical worktree flow:

1. Create worktree under `D:/projects/worktree/ai-shelf--<slug>` (see SKILL.md).
2. In AI Shelf, **📁 Folder** → select that path → agent pane opens in the worktree.
3. Leave another pane on `D:/projects/ai-shelf` for `develop` / comparison.

Pane `cwd` values persist in the profile snapshot; switching profiles restores each pane’s directory independently.

## Remove worktree safely

1. Ensure no uncommitted work the user needs (or they approved discard).
2. From main repo: `git worktree remove "D:/projects/worktree/ai-shelf--<slug>"`
3. If folder remains empty but registered: `git worktree prune`

Do not delete the directory with `Remove-Item` alone before `git worktree remove` — Git’s registry can desync.

## Hotfix from `main` (rare)

Only when the user asks for a production hotfix:

```powershell
git worktree add -b fix/critical "D:/projects/worktree/ai-shelf--fix-critical" main
```

PR base is usually `main`; merge policy is up to the user.

## Release skill boundary

Releases (version bump, tag, CHANGELOG) use [ai-shelf-release](../ai-shelf-release/SKILL.md) on **`main`**. Feature worktrees should not run the release workflow unless the user explicitly switches context to a release task.

---
name: git-worktree-dev
description: >-
  Creates and manages git worktrees for ai-shelf under D:/projects/worktree
  (ai-shelf--<slug>) so feature work runs on a new branch without disturbing the
  main checkout at D:/projects/ai-shelf. Covers branch naming, worktree add/list/remove,
  pnpm install, push and PR handoff, and cleanup. Use when the user asks for worktree,
  isolated branch development, D:/projects/worktree, or 用 worktree 開新分支開發.
disable-model-invocation: true
---

# Git worktree development (ai-shelf)

Use **git worktree** so the user keeps their current checkout (often `develop`) while implementing a feature in a **new branch + separate folder**.

## Repo conventions

| Item | Default |
|------|---------|
| Integration branch | `develop` (base for new feature branches) |
| Release branch | `main` (do not branch features from `main` unless the user asks) |
| Remote | `origin` → `https://github.com/MomentaryChen/ai-shelf.git` |
| Main checkout | `D:/projects/ai-shelf` (resolve with `git rev-parse --show-toplevel`) |
| Worktree root | `D:/projects/worktree` (all ai-shelf worktrees live here) |

## Safety (always)

- **Never** change git config.
- **Never** `git push --force` to `main` or `develop` unless the user explicitly requests it.
- **Never** skip hooks (`--no-verify`) unless the user asks.
- Before `worktree add`, confirm the target path does **not** exist and is not already listed in `git worktree list`.
- Run destructive git commands (`worktree remove`, `branch -D`) only after the user confirms or the task is clearly finished.

## When to use a worktree

Use a worktree when the user wants to:

- Start a feature without stashing or switching away from the current branch.
- Run two branches side by side (e.g. `develop` in main folder, `feat/...` in another).
- Avoid `node_modules` / build churn from repeated `git checkout`.

Stay in the **existing checkout** only if the user explicitly wants a simple `git switch -c` in the same folder.

## Workflow

Copy and track progress:

```
Worktree task:
- [ ] 1. Confirm branch name + base branch
- [ ] 2. Choose worktree path
- [ ] 3. git fetch + worktree add -b
- [ ] 4. Install deps in worktree (pnpm install)
- [ ] 5. Implement / test in worktree path only
- [ ] 6. Commit, push branch, PR (if requested)
- [ ] 7. Remove worktree when done (optional)
```

### Step 1 — Branch name

- Prefer: `feat/<short-topic>`, `fix/<short-topic>`, `chore/<short-topic>`.
- If the user only describes the task, propose a branch name and confirm once.
- Base branch: **`develop`** unless they name another (e.g. `main` for hotfix).

### Step 2 — Worktree path

**Fixed root** (do not use sibling `D:/projects/ai-shelf--*` paths unless the user overrides):

```text
D:/projects/worktree/ai-shelf--<slug>
```

Example: branch `feat/terminal-search` →  
`D:/projects/worktree/ai-shelf--feat-terminal-search`

**Slug rules:** take branch name, replace `/` and `\` with `-`, remove characters unsafe in paths, lowercase optional.

Before first `worktree add`, ensure the root exists:

```powershell
New-Item -ItemType Directory -Force -Path "D:/projects/worktree"
```

Override only if the user names a different base path; otherwise always use `D:/projects/worktree/ai-shelf--<slug>`.

### Step 3 — Create worktree

From the **main** repository root (not inside an existing worktree unless adding another linked tree):

```powershell
git fetch origin
git worktree list
```

Create branch and directory in one step:

```powershell
New-Item -ItemType Directory -Force -Path "D:/projects/worktree"
git worktree add -b feat/terminal-search "D:/projects/worktree/ai-shelf--feat-terminal-search" develop
```

If the branch already exists locally:

```powershell
git worktree add "D:/projects/worktree/ai-shelf--feat-terminal-search" feat/terminal-search
```

If the branch exists only on remote:

```powershell
git fetch origin feat/terminal-search:feat/terminal-search
git worktree add "D:/projects/worktree/ai-shelf--feat-terminal-search" feat/terminal-search
```

**All file edits, terminal commands, and tests for this task** should run with cwd = the **worktree path**, not the original checkout (unless the user says otherwise).

Tell the user explicitly:

- Worktree path
- Branch name
- Base branch used

### Step 4 — Bootstrap the worktree

In the worktree directory:

```powershell
cd "D:/projects/worktree/ai-shelf--feat-terminal-search"
pnpm install
```

Optional before first PR / when touching native modules:

```powershell
pnpm build
pnpm lint
```

(`pnpm install` in this monorepo rebuilds native deps such as `node-pty` and `better-sqlite3`.)

### Step 5 — Develop

- Commit on the worktree branch only.
- Do not commit unrelated changes in the original checkout.
- If the user needs updates from `develop`:

```powershell
git fetch origin
git merge origin/develop
# or: git rebase origin/develop  (only if user prefers rebase)
```

### Step 6 — Push and PR

```powershell
git push -u origin HEAD
```

Create PR with `gh` when the user asks (base **`develop`** unless they specify `main`):

```powershell
gh pr create --base develop --title "..." --body "..."
```

Before `gh pr create`, run `git status`, `git diff`, and `git log` per the repository’s PR workflow rules.

### Step 7 — Cleanup (after merge or abandon)

When the user is done with the worktree:

```powershell
cd "D:/projects/ai-shelf"
git worktree remove "D:/projects/worktree/ai-shelf--feat-terminal-search"
```

If Git refuses because of uncommitted changes, stop and ask — do not use `--force` unless the user explicitly wants to discard that worktree’s uncommitted files.

Optional branch cleanup after merge:

```powershell
git branch -d feat/terminal-search
git fetch origin --prune
```

## Quick reference

| Action | Command |
|--------|---------|
| List worktrees | `git worktree list` |
| Add new branch + dir | `git worktree add -b <branch> <path> <base>` |
| Add existing branch | `git worktree add <path> <branch>` |
| Remove worktree | `git worktree remove <path>` |
| Prune stale metadata | `git worktree prune` |

## Failure handling

| Problem | Action |
|---------|--------|
| Path already exists | Pick a new slug or ask user to remove/rename the folder |
| Branch already checked out | `git worktree list` — one branch cannot be checked out in two places |
| `pnpm install` fails | Fix in worktree; see [reference.md](reference.md) |
| User continues in wrong folder | Remind them of worktree path; `git branch --show-current` in each dir |

## Additional resources

- Troubleshooting and multi-worktree notes: [reference.md](reference.md)

---
name: ai-shelf-release
description: >-
  Ships an AI Shelf release when the user gives a version tag. Bumps root and
  packages/cli package.json, adds a Keep-a-Changelog English section to
  CHANGELOG.md from git history (or user bullets), commits, pushes main, and
  pushes an annotated tag to trigger the Windows setup GitHub Release workflow.
  Use when the user says release, ship, tag, CHANGELOG for a version, push v1.x,
  or publishes ai-shelf on GitHub.
disable-model-invocation: true
---

# AI Shelf release (tag + CHANGELOG + git)

When the user names a **semver** (with or without leading `v`), run this workflow end-to-end unless they only asked for a draft CHANGELOG.

## Parse version

- Accept `1.2.3` or `v1.2.3`. Normalize to **`X.Y.Z`** for files and **`vX.Y.Z`** for the git tag.
- Repo rules: **never** change git config; **never** `git push --force` to `main`/`master`; **never** skip hooks (`--no-verify`) unless the user asks.

## Preconditions

1. `git status` — if unrelated uncommitted work exists, stop and ask whether to stash, discard, or include it before releasing.
2. Prefer **`main`** on **`origin/main`**. If on another branch, confirm merge strategy or switch to `main` after merge.
3. Read current version from root [package.json](../../../package.json). New version must be **strictly greater** than current (semver). If equal or lower, stop and ask.

## 1. [CHANGELOG.md](../../../CHANGELOG.md) (canonical; drives GitHub Release body)

- Format: [Keep a Changelog](https://keepachangelog.com/) English, new block **at the top** (after intro paragraphs), **newest first**:

```markdown
## [X.Y.Z] - YYYY-MM-DD

Short one-line summary for humans.

### Added | Changed | Fixed | Deprecated | Removed | Security
- ...
```

- Date: use **today’s date** from the user environment unless the user specifies otherwise.
- Content source (in order):
  1. If the user pasted **release bullets** in chat, use those (map to Added/Changed/Fixed as appropriate).
  2. Else derive from git: `git log $(git describe --tags --abbrev=0 2>nul)..HEAD --pretty=format:- %s` (PowerShell: adapt or use `git log` since last tag). Group into sections; de-duplicate; skip noise (`chore`, typo-only) unless user wants full detail.
  3. If there is **no prior tag**, summarize `git log --oneline -50` or ask for a short bullet list.
- Bottom reference line for this version (optional in repo file): `[X.Y.Z]: https://github.com/<owner>/<repo>/releases/tag/vX.Y.Z` — resolve `<owner>/<repo>` from `git remote get-url origin`.
- Do **not** duplicate the entire prior release; only add the new `## [X.Y.Z]` section.

CI reads CHANGELOG via [scripts/release-notes.mjs](../../../scripts/release-notes.mjs); relative links inside that section become absolute on the Release page.

## 2. Version bumps (must stay aligned)

- Root [package.json](../../../package.json): `"version": "X.Y.Z"`.
- [packages/cli/package.json](../../../packages/cli/package.json): `"version": "X.Y.Z"`.
- README first-line badge paragraph: **`**vX.Y.Z**`** in [README.md](../../../README.md) and [README.zh-TW.md](../../../README.zh-TW.md).

Do **not** hardcode semver in `src/cli.ts`, `packages/cli/src/cli/main.ts`, or renderer footer — those already read package/build metadata.

## 3. Quick sanity check (optional but recommended)

- `pnpm lint`
- `pnpm build`

Fix failures or stop and report.

## 4. Commit

Single release prep commit (unless user prefers split commits):

```text
chore(release): vX.Y.Z
```

Body: one line pointing to CHANGELOG section if helpful.

## 5. Push branch, then tag

Order matters:

1. `git push origin main` (or the release branch the user confirmed).
2. Annotated tag matching [docs/RELEASE.md](../../../docs/RELEASE.md):

```bash
git tag -a vX.Y.Z -m "AI Shelf X.Y.Z"
git push origin vX.Y.Z
```

Pushing **`v*`** triggers [.github/workflows/release.yml](../../../.github/workflows/release.yml) (Windows NSIS + Release body from CHANGELOG).

## 6. After push

Tell the user to open **Actions → Release** and then **Releases**; confirm asset `AI-Shelf-Setup-X.Y.Z.exe` and that release notes match CHANGELOG.

Local preview of GitHub release body:

```bash
# POSIX
GITHUB_REF_NAME=vX.Y.Z GITHUB_REPOSITORY=Owner/repo node scripts/release-notes.mjs
```

## If the user only wants CHANGELOG text

Perform sections **Parse version**, **CHANGELOG**, and **Version bumps** without commit/push/tag unless they explicitly ask to continue.

---
name: ai-shelf-release
description: >-
  Ships an AI Shelf release when the user gives a version tag. Preps on develop
  (version bumps, Keep-a-Changelog English section, optional docs screenshots),
  creates release/vX.Y.Z from develop, merges that branch into main, then pushes
  an annotated tag on main to trigger the Windows/macOS/Linux + npm GitHub Release
  workflow. Syncs develop back to main afterward. Use when the user says release,
  ship, tag, CHANGELOG for a version, push v1.x, or publishes ai-shelf on GitHub.
disable-model-invocation: true
---

# AI Shelf release (develop → release branch → main + tag)

When the user names a **semver** (with or without leading `v`), run this workflow end-to-end unless they only asked for a draft CHANGELOG.

## Branch model

```text
feature/*  →  develop  →  release/vX.Y.Z  →  main  →  tag vX.Y.Z
                              ↑                        │
                              └──── sync develop ←─────┘
```

| Stage | Branch | What happens |
|-------|--------|--------------|
| Prep | `develop` (or a short-lived prep commit on `develop`) | Version bump, CHANGELOG, docs assets |
| Ship | `release/vX.Y.Z` created **from develop** | Contains only the release prep; PR/merge into `main` |
| Publish | `main` | After merge, annotated tag `vX.Y.Z` on the merge commit |
| Align | `develop` ← `main` | Post-release sync so develop does not drift |

Do **not** commit release prep directly on `main`, and do **not** tag from `develop`.

## Parse version

- Accept `1.2.3` or `v1.2.3`. Normalize to **`X.Y.Z`** for files and **`vX.Y.Z`** for the git tag / release branch name (`release/vX.Y.Z`).
- Repo rules: **never** change git config; **never** `git push --force` to `main`/`master`/`develop`; **never** skip hooks (`--no-verify`) unless the user asks.

## Preconditions

1. `git status` — if unrelated uncommitted work exists, stop and ask whether to stash, discard, or include it before releasing.
2. Prefer a **worktree** on **`develop`** at **`origin/develop`** (see [git-worktree-dev](../git-worktree-dev/SKILL.md)). If the main checkout is busy, create `…/worktree/ai-shelf--release-vX-Y-Z` from `develop`.
3. Ensure `develop` includes everything intended for this release (`git fetch`; confirm no open release-blocking PRs the user still wants in).
4. Read current version from root [package.json](../../../package.json) (on `develop`). New version must be **strictly greater** than current (semver). If equal or lower, stop and ask.
5. **Windows + display** required when refreshing docs images (step 1 below). **ffmpeg** on `PATH` for the terminal demo GIF.

## 1. Docs visuals (when desktop UI changed)

Skip this section only when the release has **no** UI/visual changes.

On **Windows** (local desktop — not CI), from the release worktree / `develop` checkout:

```powershell
pnpm gen:docs-assets
```

This runs one build, then Playwright captures **both** locales:

- `tests/screenshots/{en,zh}/*.png` — [README.md](../../../README.md) / [docs/pages.md](../../../docs/pages.md) use `en`; [README.zh-TW.md](../../../README.zh-TW.md) / [docs/pages.zh-TW.md](../../../docs/pages.zh-TW.md) use `zh`
- `docs/assets/{en,zh}/terminal-demo.gif` — README hero (locale-matched)

Details ([docs/RELEASE.md](../../../docs/RELEASE.md)):

- `AISHELF_DOCS_LOCALE` selects `en` or `zh` for a single Playwright run; `gen:docs-assets` loops both
- Terminal shots use an isolated **Demo** profile group via `AISHELF_APP_DATA_DIR` — not the developer's real `%APPDATA%/ai-shelf` workspace
- Inventory tabs still reflect CLIs on the machine running the command — review screenshots before committing
- Lighter targets: `AISHELF_DOCS_LOCALE=en|zh pnpm test:e2e` (PNGs only), `pnpm gen:terminal-demo-gif` (both GIFs; set `AISHELF_DOCS_LOCALE` for one)

Include updated PNG/GIF files in the **release prep commit** (step 5). If `gen:docs-assets` fails (missing ffmpeg, no display), stop and report — do not create the release branch or tag.

## 2. [CHANGELOG.md](../../../CHANGELOG.md) (canonical; drives GitHub Release body)

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

## 3. Version bumps (must stay aligned)

- Root [package.json](../../../package.json): `"version": "X.Y.Z"`.
- [packages/cli/package.json](../../../packages/cli/package.json): `"version": "X.Y.Z"`.
- README first-line badge paragraph: **`**vX.Y.Z**`** in [README.md](../../../README.md) and [README.zh-TW.md](../../../README.zh-TW.md).

Do **not** hardcode semver in `src/cli.ts`, `packages/cli/src/cli/main.ts`, or renderer footer — those already read package/build metadata.

## 4. Quick sanity check (optional but recommended)

- `pnpm lint`
- `pnpm build`

Fix failures or stop and report.

## 5. Commit on develop, then create `release/vX.Y.Z`

Single release prep commit on **`develop`** (unless user prefers split commits). Stage version files, CHANGELOG, and any refreshed `tests/screenshots/{en,zh}/*.png` + `docs/assets/{en,zh}/terminal-demo.gif` from step 1:

```text
chore(release): vX.Y.Z
```

Body: one line pointing to CHANGELOG section if helpful.

Then **automatically** cut the release branch from that commit (do not wait for the user to name the branch):

```powershell
git fetch origin
git push origin develop
git switch -c release/vX.Y.Z
git push -u origin release/vX.Y.Z
```

If prep was done in a worktree already on a throwaway branch, cherry-pick or recreate the same commit onto `develop`, push `develop`, then create `release/vX.Y.Z` from `origin/develop`.

Tell the user: **release branch** `release/vX.Y.Z`, **base for merge** `main`, **tag later on** `main`.

## 6. Merge release branch → `main`

Order matters — merge **before** tagging:

1. Open a PR (preferred) or merge locally:
   - `gh pr create --base main --head release/vX.Y.Z --title "release: vX.Y.Z" --body "…"`
   - Merge when green (`gh pr merge --merge` or squash only if the user prefers; default **merge** keeps the release commit readable).
2. Or local fast-forward / merge into `main` in a worktree, then `git push origin main`.
3. Confirm `origin/main` contains `chore(release): vX.Y.Z` (or the PR merge commit that includes it).

Do **not** tag until `main` has the release commit.

## 7. Tag on `main`

From a checkout of **`main`** at the release merge tip:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git tag -a vX.Y.Z -m "AI Shelf X.Y.Z"
git push origin vX.Y.Z
```

Pushing **`v*`** triggers [.github/workflows/release.yml](../../../.github/workflows/release.yml):

- **create-release** — Release body from CHANGELOG (no binaries yet).
- **release-windows** — NSIS installer; attaches **`AI-Shelf-Setup-*.exe`**, **`latest.yml`**, **`*.blockmap`**.
- **release-mac** — unsigned DMG/ZIP (`arm64` + `x64`); attaches **`AI-Shelf-*.dmg`**, **`.zip`**, **`latest-mac.yml`**.
- **release-linux** — unsigned AppImage; attaches **`AI-Shelf-*.AppImage`**, **`latest-linux.yml`**.
- **publish-npm** — publishes **`ai-shelf`** from `packages/cli` to npm (needs repo secret **`NPM_TOKEN`**; version synced from tag via [scripts/sync-version-from-tag.mjs](../../../scripts/sync-version-from-tag.mjs)).

See [docs/RELEASE.md](../../../docs/RELEASE.md).

## 8. Sync `develop` ← `main`

After the tag is on `main`, bring **`develop`** back so the next feature branch starts from the released tip (avoids stale version numbers and release conflicts). Follow [git-worktree-dev Step 8](../git-worktree-dev/SKILL.md):

```powershell
git fetch origin
git log --oneline origin/develop..origin/main   # should list the release merge / tag tip commits
git log --oneline origin/main..origin/develop   # should be empty if develop had no unique commits after cut
```

- If `develop` is behind only: `git push origin origin/main:develop` (fast-forward).
- If both sides diverge: merge `origin/main` into `develop` in a worktree, resolve (prefer `main` for shipped version/UI), push `develop`.
- **Never** force-push `develop` unless the user explicitly asks.

Optional cleanup: delete `release/vX.Y.Z` locally/remotely after merge (`git push origin --delete release/vX.Y.Z`).

## 9. After push

Tell the user to open **Actions → Release** and then **Releases**. Confirm:

- Desktop jobs succeeded (**create-release**, **release-windows**, **release-mac**, **release-linux**) plus **publish-npm**
- Windows: **`AI-Shelf-Setup-X.Y.Z.exe`**, **`latest.yml`**, **`*.blockmap`**
- macOS: **`AI-Shelf-X.Y.Z-{arm64,x64}.dmg`** (+ zip) and **`latest-mac.yml`**
- Linux: **`AI-Shelf-X.Y.Z.AppImage`** and **`latest-linux.yml`**
- **`npm view ai-shelf version`** shows `X.Y.Z` (if publish-npm failed, check **`NPM_TOKEN`** secret)
- Release description matches CHANGELOG
- `origin/develop` matches (or includes) `origin/main` after sync

If this is the **first release** that ships in-app auto-update, mention in CHANGELOG (or release notes) that users on older installers must install that build **once manually**; later versions can upgrade inside the app.

**Manual publish fallback:** package on the matching OS (`pnpm dist:win` / `dist:mac` / `dist:linux`) and upload the artifacts listed in [docs/RELEASE.md](../../../docs/RELEASE.md) — not unpacked folders.

Local preview of GitHub release body:

```bash
# POSIX
GITHUB_REF_NAME=vX.Y.Z GITHUB_REPOSITORY=Owner/repo node scripts/release-notes.mjs
```

## Hotfix on `main` (exception)

Only when the user asks for a production hotfix that cannot wait for `develop`:

1. Branch `fix/…` from `main`, ship via PR into `main`, tag on `main`.
2. Immediately merge/sync that fix back into `develop` (same as step 8).

Do not use this path for a normal versioned release.

## If the user only wants CHANGELOG text

Perform sections **Parse version**, **Docs visuals** (if applicable), **CHANGELOG**, and **Version bumps** without commit / release branch / merge / tag unless they explicitly ask to continue.

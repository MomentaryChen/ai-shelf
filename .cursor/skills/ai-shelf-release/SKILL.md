---
name: ai-shelf-release
description: >-
  Ships an AI Shelf release when the user gives a version tag. Bumps root and
  packages/cli package.json, adds a Keep-a-Changelog English section to
  CHANGELOG.md from git history (or user bullets), refreshes README/docs screenshots
  via pnpm gen:docs-assets when UI changed, commits, pushes main, and
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
4. **Windows + display** required when refreshing docs images (step 1 below). **ffmpeg** on `PATH` for the terminal demo GIF.

## 1. Docs visuals (when desktop UI changed)

Skip this section only when the release has **no** UI/visual changes.

On **Windows** (local desktop — not CI):

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

Include updated PNG/GIF files in the **release prep commit** (step 5). If `gen:docs-assets` fails (missing ffmpeg, no display), stop and report — do not tag.

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

## 5. Commit

Single release prep commit (unless user prefers split commits). Stage version files, CHANGELOG, and any refreshed `tests/screenshots/{en,zh}/*.png` + `docs/assets/{en,zh}/terminal-demo.gif` from step 1:

```text
chore(release): vX.Y.Z
```

Body: one line pointing to CHANGELOG section if helpful.

## 6. Push branch, then tag

Order matters:

1. `git push origin main` (or the release branch the user confirmed).
2. Annotated tag matching [docs/RELEASE.md](../../../docs/RELEASE.md):

```bash
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

## 7. After push

Tell the user to open **Actions → Release** and then **Releases**. Confirm:

- Desktop jobs succeeded (**create-release**, **release-windows**, **release-mac**, **release-linux**) plus **publish-npm**
- Windows: **`AI-Shelf-Setup-X.Y.Z.exe`**, **`latest.yml`**, **`*.blockmap`**
- macOS: **`AI-Shelf-X.Y.Z-{arm64,x64}.dmg`** (+ zip) and **`latest-mac.yml`**
- Linux: **`AI-Shelf-X.Y.Z.AppImage`** and **`latest-linux.yml`**
- **`npm view ai-shelf version`** shows `X.Y.Z` (if publish-npm failed, check **`NPM_TOKEN`** secret)
- Release description matches CHANGELOG

If this is the **first release** that ships in-app auto-update, mention in CHANGELOG (or release notes) that users on older installers must install that build **once manually**; later versions can upgrade inside the app.

**Manual publish fallback:** package on the matching OS (`pnpm dist:win` / `dist:mac` / `dist:linux`) and upload the artifacts listed in [docs/RELEASE.md](../../../docs/RELEASE.md) — not unpacked folders.

Local preview of GitHub release body:

```bash
# POSIX
GITHUB_REF_NAME=vX.Y.Z GITHUB_REPOSITORY=Owner/repo node scripts/release-notes.mjs
```

## If the user only wants CHANGELOG text

Perform sections **Parse version**, **Docs visuals** (if applicable), **CHANGELOG**, and **Version bumps** without commit/push/tag unless they explicitly ask to continue.

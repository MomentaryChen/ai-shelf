# Release guide

How maintainers ship **AI Shelf** desktop builds and how Windows users install them.

---

## For maintainers

### Prerequisites

- Node.js ≥ 22, pnpm ≥ 10.12.1
- Windows machine (or rely on CI) for `pnpm dist:win`
- **ffmpeg** on `PATH` when running `pnpm gen:docs-assets` locally (GIF step; Windows: `choco install ffmpeg` or [ffmpeg builds](https://www.gyan.dev/ffmpeg/builds/))
- Git tag `vX.Y.Z` must match the release version (e.g. tag `v2.0.0` ↔ `2.0.0`). CI runs [scripts/sync-version-from-tag.mjs](../scripts/sync-version-from-tag.mjs) so root and `packages/cli` `version` fields align with the tag before build/publish.
- **npm:** GitHub repo secret **`NPM_TOKEN`** — [npm access token](https://docs.npmjs.com/creating-and-viewing-access-tokens) with **Publish** (Automation token recommended for CI). Without it, the `publish-npm` job fails; the Windows installer job still runs.

### Pre-release checklist

1. [ ] All changes committed and pushed to `main`
2. [ ] Root and `packages/cli` `version` fields match the intended release
3. [ ] `pnpm lint`
4. [ ] **Docs visuals** — if this release changes the desktop UI, refresh README / pages screenshots **before** tagging:

   **Option A — GitHub Actions (recommended)**

   1. Push UI changes to `main` (or open a PR and merge).
   2. **Actions → Docs assets → Run workflow** on that branch (Windows runner; ~15–30 min).
   3. When the job commits `docs: refresh README screenshots [skip ci]`, pull on your machine if needed.

   **Option B — Local (Windows with display)**

   ```powershell
   pnpm gen:docs-assets
   ```

   Both refresh `tests/screenshots/*.png` and `docs/assets/terminal-demo.gif`. Locale is pinned to **zh** (`AISHELF_DOCS_LOCALE`) so CI and local output match [pages.zh-TW.md](pages.zh-TW.md).

   - Individual targets: `pnpm test:e2e` (PNGs only), `pnpm gen:terminal-demo-gif` (GIF only)
   - Skip only when the release has **no** UI/visual changes
   - PRs that touch `src/renderer/**` run a **stale-screenshot check**; merge only after images are current
5. [ ] Local smoke test: `pnpm dist:win` → install `release/AI-Shelf-Setup-<version>.exe`
6. [ ] [CHANGELOG.md](../CHANGELOG.md) updated for user-facing changes
7. [ ] README version badge (`**vX.Y.Z**`) matches the release
8. [ ] Release workflow reports **Authenticode signature present** (self-signed; SmartScreen may still warn — see [WINDOWS_CODE_SIGNING.md](WINDOWS_CODE_SIGNING.md))

### Publish via GitHub Actions (recommended)

Pushing an annotated tag triggers [.github/workflows/release.yml](../.github/workflows/release.yml):

```powershell
git tag -a v1.0.0 -m "AI Shelf 1.0.0"
git push origin v1.0.0
```

1. Open **Actions** → **Release** workflow on the tag commit (two jobs: **Publish ai-shelf to npm** + **release-windows**)
2. When both are green, open **Releases** on GitHub
3. Confirm release assets include **`AI-Shelf-Setup-<version>.exe`**, **`latest.yml`**, and **`*.blockmap`** (required for in-app auto-update via `electron-updater`)
4. Confirm **`ai-shelf@<version>`** on [npm](https://www.npmjs.com/package/ai-shelf): `npm view ai-shelf version`
5. Confirm the **release description** matches **[CHANGELOG.md](../CHANGELOG.md)** for that version (CI builds it via [scripts/release-notes.mjs](../scripts/release-notes.mjs))
6. Optionally tweak wording on GitHub only for hotfixes — then mirror edits back into `CHANGELOG.md` so they stay aligned

#### GitHub secret: `NPM_TOKEN`

1. npm → **Access Tokens** → **Generate Token** → type **Granular** or **Classic** with publish rights for package `ai-shelf`
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. Name: `NPM_TOKEN`, value: the token

First publish: ensure the package name `ai-shelf` is available on npm (or change `packages/cli/package.json` `name` / scope before tagging).

### Release page vs changelog

| Source | Role |
|--------|------|
| [CHANGELOG.md](../CHANGELOG.md) | **Canonical** user-facing notes per version |
| GitHub Release body | Generated from the matching `## [x.y.z]` section when you push tag `vx.y.z` |
| Commit-only auto-notes | **Disabled** — avoids diverging from the changelog |

Before tagging: ensure `CHANGELOG.md` has a `## [<version>]` section with the bullets you want users to see on the Release page.

### Publish manually (fallback)

**Desktop (Windows installer):**

```powershell
pnpm install
pnpm build
pnpm dist:win
```

Upload `release/AI-Shelf-Setup-<version>.exe`, `release/latest.yml`, and `release/*.blockmap` to a GitHub Release. Do **not** attach portable builds or `win-unpacked` folders for end users.

**CLI (npm):**

```powershell
node scripts/sync-version-from-tag.mjs 2.0.0   # or rely on tag in CI
pnpm install
pnpm --filter ai-shelf run build
cd packages/cli
npm publish --access public
```

Requires `npm login` locally and publish rights on the `ai-shelf` package.

### Developer-only targets

| Script | Output | Ship to users? |
|--------|--------|----------------|
| `pnpm dist:win` | `release/AI-Shelf-Setup-<version>.exe` (NSIS) | Yes |
| `pnpm dist:win:portable` | portable `.exe` in `release/` | No |
| `pnpm package:win` | `dist/ai-shelf.exe` (CLI only, pkg) | No |

### Code signing

Every release tag build is **self-signed** in CI (no secrets required). The installer has an Authenticode signature, but Windows **does not trust** self-signed publishers — SmartScreen may still warn.

Details and optional local signed builds: **[docs/WINDOWS_CODE_SIGNING.md](WINDOWS_CODE_SIGNING.md)**.

---

## For Windows users

### Install

1. Go to [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases)
2. Download **`AI-Shelf-Setup-<version>.exe`** (the installer only)
3. Run the installer and follow the wizard (desktop / Start menu shortcuts are created)
4. Launch **AI Shelf** from the Start menu or desktop

### SmartScreen (unsigned builds)

If Windows shows **“Windows protected your PC”**:

1. Click **More info**
2. Click **Run anyway**

This is expected for **self-signed** builds (and fully unsigned builds). Choose **More info** → **Run anyway**. A CA-trusted certificate would show a verified publisher; see [WINDOWS_CODE_SIGNING.md](WINDOWS_CODE_SIGNING.md).

### Requirements

- Windows 10 or 11 (64-bit)
- AI CLIs (`claude`, `copilot`, `agent`, etc.) must be installed separately and available on `PATH` for inventory and launch features
- Node.js is **not** required for the installed desktop app (only for building from source)

### In-app updates (desktop installer)

Installed **NSIS** builds check [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases) on startup (after a short delay). When a newer version exists, a dialog asks to download; progress shows 0–100%, then you confirm **Restart** to finish installing.

- **First time** this feature ships: install that release manually once; later upgrades can stay in-app.
- **Self-signed builds**: SmartScreen may appear when running the installer or in-app updates (same workaround: **More info** → **Run anyway**).
- **Dev / `electron .`**: no update checks (not packaged).

Maintainers: `package.json` → `build.publish` must point at this repo; CI must upload `latest.yml` (see workflow above).

### Uninstall

**Settings → Apps → Installed apps → AI Shelf → Uninstall**, or use **Add or remove programs**.

---

## Version alignment

| Item | Example |
|------|---------|
| Git tag | `v1.0.0` |
| `package.json` version | `1.0.0` |
| Installer filename | `AI-Shelf-Setup-1.0.0.exe` |
| Electron `app.getVersion()` | `1.0.0` |
| npm package `ai-shelf` | `1.0.0` |

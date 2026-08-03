# Release guide

How maintainers ship **AI Shelf** desktop builds and how users install them on Windows, macOS, and Linux.

---

## For maintainers

### Prerequisites

- Node.js ≥ 22, pnpm ≥ 10.12.1
- Prefer GitHub Actions for packaged builds (`release-windows` / `release-mac` / `release-linux`). Local packaging needs the matching OS (`pnpm dist:win` on Windows, `pnpm dist:mac` on macOS, `pnpm dist:linux` on Linux).
- **ffmpeg** on `PATH` when running `pnpm gen:docs-assets` locally (GIF step; Windows: `choco install ffmpeg` or [ffmpeg builds](https://www.gyan.dev/ffmpeg/builds/))
- Git tag `vX.Y.Z` must match the release version (e.g. tag `v2.0.0` ↔ `2.0.0`). CI runs [scripts/sync-version-from-tag.mjs](../scripts/sync-version-from-tag.mjs) so root and `packages/cli` `version` fields align with the tag before build/publish.
- **npm:** GitHub repo secret **`NPM_TOKEN`** — [npm access token](https://docs.npmjs.com/creating-and-viewing-access-tokens) with **Publish** (Automation token recommended for CI). Without it, the `publish-npm` job fails; desktop installer jobs still run.

### Pre-release checklist

1. [ ] All changes committed and pushed to `main`
2. [ ] Root and `packages/cli` `version` fields match the intended release
3. [ ] `pnpm lint`
4. [ ] **Docs visuals** — if this release changes the desktop UI, refresh README / pages screenshots **locally on Windows before** tagging:

   ```powershell
   pnpm gen:docs-assets
   ```

   - Regenerates `tests/screenshots/{en,zh}/*.png` and `docs/assets/{en,zh}/terminal-demo.gif`
   - Requires a **Windows desktop** (Electron display) and **ffmpeg** on `PATH`
   - Terminal screenshots use an isolated **Demo** profile group (`tests/e2e/helpers/docs-demo-workspace.ts`), not your real workspace
   - Runs **both** locales (`en` + `zh`) so English README/`pages.md` and Chinese README/`pages.zh-TW.md` each get matching UI screenshots
   - Inventory tabs still reflect CLIs installed on your machine — review before committing
   - Individual targets: `pnpm test:e2e` with `AISHELF_DOCS_LOCALE=en|zh` (PNGs only), `pnpm gen:terminal-demo-gif` (GIFs for both locales; set `AISHELF_DOCS_LOCALE` for one)
   - Skip only when the release has **no** UI/visual changes
   - Commit the updated image files with the release
5. [ ] Local smoke test when you can: `pnpm dist:win` (Windows), or rely on CI for macOS/Linux packages
6. [ ] [CHANGELOG.md](../CHANGELOG.md) updated for user-facing changes
7. [ ] README version badge (`**vX.Y.Z**`) matches the release
8. [ ] Windows job reports **Authenticode signature present** (self-signed; SmartScreen may still warn — see [WINDOWS_CODE_SIGNING.md](WINDOWS_CODE_SIGNING.md)). macOS/Linux builds are **unsigned** for now.

### Publish via GitHub Actions (recommended)

Pushing an annotated tag triggers [.github/workflows/release.yml](../.github/workflows/release.yml):

```powershell
git tag -a v1.0.0 -m "AI Shelf 1.0.0"
git push origin v1.0.0
```

1. Open **Actions** → **Release** workflow on the tag commit (`publish-npm`, `create-release`, then `release-windows` / `release-mac` / `release-linux`)
2. When desktop jobs are green, open **Releases** on GitHub
3. Confirm release assets include:
   - Windows: **`AI-Shelf-Setup-<version>.exe`**, **`latest.yml`**, **`*.blockmap`**
   - macOS: **`AI-Shelf-<version>-arm64.dmg`**, **`AI-Shelf-<version>-x64.dmg`**, matching **`.zip`**, **`latest-mac.yml`**
   - Linux: **`AI-Shelf-<version>.AppImage`**, **`latest-linux.yml`**
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

Package on the matching OS, then upload the artifacts listed below to a GitHub Release. Do **not** attach unpacked folders (`*-unpacked`) for end users.

**Windows:**

```powershell
pnpm install
pnpm dist:win
```

Upload `release/AI-Shelf-Setup-<version>.exe`, `release/latest.yml`, and `release/*.blockmap`.

**macOS** (must run on a Mac; unsigned):

```bash
pnpm install
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm dist:mac
```

Upload `release/AI-Shelf-<version>-*.dmg`, matching `.zip`, `release/latest-mac.yml`, and `release/*.blockmap`.

**Linux:**

```bash
pnpm install
pnpm dist:linux
```

Upload `release/AI-Shelf-<version>.AppImage` and `release/latest-linux.yml`.

**CLI (npm):**

```powershell
node scripts/sync-version-from-tag.mjs 2.0.0   # or rely on tag in CI
pnpm install
pnpm --filter ai-shelf run build
cd packages/cli
npm publish --access public
```

Requires `npm login` locally and publish rights on the `ai-shelf` package.

### Desktop package targets

| Script | Output | Ship to users? |
|--------|--------|----------------|
| `pnpm dist:win` | `release/AI-Shelf-Setup-<version>.exe` (NSIS) | Yes |
| `pnpm dist:mac` | `release/AI-Shelf-<version>-{arm64,x64}.dmg` + `.zip` | Yes (unsigned) |
| `pnpm dist:linux` | `release/AI-Shelf-<version>.AppImage` | Yes (unsigned) |
| `pnpm dist:win:portable` | portable `.exe` in `release/` | No |
| `pnpm package:win` | `dist/ai-shelf.exe` (CLI only, pkg) | No |

### Code signing

| Platform | Current policy |
|----------|----------------|
| Windows | **Self-signed** Authenticode in CI (SmartScreen may warn). See [WINDOWS_CODE_SIGNING.md](WINDOWS_CODE_SIGNING.md). |
| macOS | **Unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`). Gatekeeper will block until the user allows the app (right-click → Open, or remove quarantine). |
| Linux | **Unsigned** AppImage — mark executable (`chmod +x`) and run. |

---

## For users

### Windows

1. Go to [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases)
2. Download **`AI-Shelf-Setup-<version>.exe`**
3. Run the installer and follow the wizard
4. Launch **AI Shelf** from the Start menu or desktop

If Windows shows **“Windows protected your PC”**: **More info** → **Run anyway**. Expected for self-signed builds; see [WINDOWS_CODE_SIGNING.md](WINDOWS_CODE_SIGNING.md).

**Requirements:** Windows 10 or 11 (64-bit). AI CLIs must be installed separately on `PATH`. Node.js is not required for the installed app.

**Uninstall:** **Settings → Apps → Installed apps → AI Shelf → Uninstall**.

### macOS (unsigned)

1. Download **`AI-Shelf-<version>-arm64.dmg`** (Apple Silicon) or **`AI-Shelf-<version>-x64.dmg`** (Intel)
2. Open the DMG and drag **AI Shelf** to Applications
3. First launch: if macOS says the app can’t be opened, **right-click the app → Open**, or clear quarantine:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/AI Shelf.app"
   ```

### Linux (unsigned)

1. Download **`AI-Shelf-<version>.AppImage`**
2. Make it executable and run:

   ```bash
   chmod +x AI-Shelf-<version>.AppImage
   ./AI-Shelf-<version>.AppImage
   ```

   Packages use electron-builder’s static AppImage runtime (`toolsets.appimage: "1.0.3"`), so **libfuse2 is not required** on modern distros.

### In-app updates

Packaged desktop builds check [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases) on startup (after a short delay). When a newer version exists, a dialog asks to download; progress shows 0–100%, then you confirm **Restart** to finish installing.

- **First time** this feature ships: install that release manually once; later upgrades can stay in-app.
- Windows self-signed builds may still hit SmartScreen on update installers.
- **Dev / `electron .`**: no update checks (not packaged).

Maintainers: `package.json` → `build.publish` must point at this repo; CI must upload `latest.yml` / `latest-mac.yml` / `latest-linux.yml`.

---

## Version alignment

| Item | Example |
|------|---------|
| Git tag | `v1.0.0` |
| `package.json` version | `1.0.0` |
| Windows installer | `AI-Shelf-Setup-1.0.0.exe` |
| macOS DMG | `AI-Shelf-1.0.0-arm64.dmg` |
| Linux AppImage | `AI-Shelf-1.0.0.AppImage` |
| Electron `app.getVersion()` | `1.0.0` |
| npm package `ai-shelf` | `1.0.0` |

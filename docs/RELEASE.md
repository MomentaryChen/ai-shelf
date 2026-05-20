# Release guide

How maintainers ship **AI Shelf** desktop builds and how Windows users install them.

---

## For maintainers

### Prerequisites

- Node.js ≥ 22, pnpm ≥ 10.12.1
- Windows machine (or rely on CI) for `pnpm dist:win`
- Git tag `vX.Y.Z` must match root [package.json](../package.json) `version` (e.g. tag `v1.0.0` ↔ version `1.0.0`)

### Pre-release checklist

1. [ ] All changes committed and pushed to `main`
2. [ ] Root and `packages/cli` `version` fields match the intended release
3. [ ] `pnpm lint` (optional: `pnpm test:e2e`)
4. [ ] Local smoke test: `pnpm dist:win` → install `release/AI-Shelf-Setup-<version>.exe`
5. [ ] [CHANGELOG.md](../CHANGELOG.md) updated for user-facing changes
6. [ ] README / GitHub Release notes updated if needed

### Publish via GitHub Actions (recommended)

Pushing an annotated tag triggers [.github/workflows/release.yml](../.github/workflows/release.yml):

```powershell
git tag -a v1.0.0 -m "AI Shelf 1.0.0"
git push origin v1.0.0
```

1. Open **Actions** → **Release** workflow on the tag commit
2. When green, open **Releases** on GitHub
3. Confirm the only attached asset is **`AI-Shelf-Setup-<version>.exe`**
4. Confirm the **release description** matches **[CHANGELOG.md](../CHANGELOG.md)** for that version (CI builds it via [scripts/release-notes.mjs](../scripts/release-notes.mjs))
5. Optionally tweak wording on GitHub only for hotfixes — then mirror edits back into `CHANGELOG.md` so they stay aligned

### Release page vs changelog

| Source | Role |
|--------|------|
| [CHANGELOG.md](../CHANGELOG.md) | **Canonical** user-facing notes per version |
| GitHub Release body | Generated from the matching `## [x.y.z]` section when you push tag `vx.y.z` |
| Commit-only auto-notes | **Disabled** — avoids diverging from the changelog |

Before tagging: ensure `CHANGELOG.md` has a `## [<version>]` section with the bullets you want users to see on the Release page.

### Publish manually (fallback)

```powershell
pnpm install
pnpm build
pnpm dist:win
```

Upload `release/AI-Shelf-Setup-<version>.exe` to a GitHub Release. Do **not** attach portable builds or `win-unpacked` folders for end users.

### Developer-only targets

| Script | Output | Ship to users? |
|--------|--------|----------------|
| `pnpm dist:win` | `release/AI-Shelf-Setup-<version>.exe` (NSIS) | Yes |
| `pnpm dist:win:portable` | portable `.exe` in `release/` | No |
| `pnpm package:win` | `dist/ai-shelf.exe` (CLI only, pkg) | No |

### Code signing

Installers are **not** code-signed in this repo. Windows SmartScreen may warn on first run. To sign later, configure `win.certificateFile` / `CSC_*` secrets in electron-builder and CI.

The **Release** GitHub Action sets `CSC_IDENTITY_AUTO_DISCOVERY=false` so `signtool` does not try to auto-pick a certificate on the runner (which can hang on helpers like `elevate.exe`).

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

This is expected until the project adds an Authenticode certificate.

### Requirements

- Windows 10 or 11 (64-bit)
- AI CLIs (`claude`, `copilot`, `agent`, etc.) must be installed separately and available on `PATH` for inventory and launch features
- Node.js is **not** required for the installed desktop app (only for building from source)

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

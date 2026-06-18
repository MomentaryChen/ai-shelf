# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

GitHub Releases use the matching `## [x.y.z]` section here as the release description (see `scripts/release-notes.mjs` and `.github/workflows/release.yml`).

## [Unreleased]

## [2.1.17] - 2026-06-03

Profile sidebar polish and middle-click terminal tab close.

### Changed

- **Profile sidebar** — Thicker card borders for clearer group separation.
- **Profile sidebar** — Remove numbered prefixes from section labels.

### Fixed

- **Terminal tabs** — Restore middle-click to close a tab in the sidebar.

## [2.1.16] - 2026-06-03

Fix TypeScript build for Windows auto-update signature hook.

### Fixed

- **Release CI desktop build** — Cast `autoUpdater` when assigning `verifyUpdateCodeSignature` (property exists on NSIS updater at runtime but not on `AppUpdater` types).

## [2.1.15] - 2026-06-03

Fix desktop auto-update for self-signed releases and improve the update error dialog.

### Fixed

- **Update error modal layout** — Cap modal height, keep action buttons visible, and show short i18n errors instead of full SignTool JSON dumps.
- **Desktop auto-update with self-signed CI** — Custom `verifyUpdateCodeSignature` accepts `HashValid` Authenticode when publisher CN matches, instead of requiring a CA-trusted `Valid` signature only.

## [2.1.14] - 2026-06-03

Fix Windows release signing with Windows SDK SignTool 10.0.26100+.

### Fixed

- **Windows SDK SignTool /fd** — Sign only with SHA256 + RFC3161 timestamp so electron-builder passes `/fd sha256` when `SIGNTOOL_PATH` points at Windows Kits 10.0.26100+ (avoids legacy SHA1 pass without `/fd`).

## [2.1.13] - 2026-06-03

Detect truncated repository `CSC_LINK` secrets before Windows signing fails in CI.

### Fixed

- **Truncated CSC_LINK in CI** — Validate PFX opens before SignTool normalization; fail with expected base64/PFX sizes when secrets are truncated; skip normalization when re-export is unnecessary.

### Added

- **`verify-csc-link-secret.ps1`** — Local check that a base64 file matches the PFX before pasting into GitHub.

## [2.1.12] - 2026-06-03

Align CI SignTool preflight with electron-builder on GitHub Actions.

### Fixed

- **SignTool path mismatch** — `import-csc-env.ps1` sets `SIGNTOOL_PATH` to the Windows SDK `signtool.exe` so preflight and packaging use the same binary instead of electron-builder’s bundled winCodeSign copy.

## [2.1.11] - 2026-06-03

SignTool-compatible PFX normalization and password handling for repository signing secrets.

### Added

- **`import-csc-env.ps1`** / **`write-csc-password-file.ps1`** — Load signing password from a runner temp file so `CSC_KEY_PASSWORD` is not corrupted in `GITHUB_ENV`.
- **SignTool preflight** — CI validates the PFX with SignTool before packaging; `import-csc-env.ps1` sets `SIGNTOOL_PATH` to the Windows SDK tool so electron-builder does not use a different bundled winCodeSign binary.

### Fixed

- **SignTool PFX load failures** — Re-export decoded PKCS#12 in a SignTool-compatible form when PowerShell can open the cert but SignTool cannot.

## [2.1.10] - 2026-06-03

Harden repository signing secret handling before electron-builder runs.

### Added

- **`setup-github-signing-secrets.ps1`** — One command to generate a PFX, validate it, and print both `CSC_LINK` / `CSC_KEY_PASSWORD` values for GitHub Secrets.
- **`write-github-env.ps1`** — Writes multiline-safe `GITHUB_ENV` entries for signing variables.

### Fixed

- **SignTool PFX load in CI** — Store `CSC_KEY_PASSWORD` in a runner temp file (not `GITHUB_ENV`), normalize decoded PKCS#12 for SignTool, run Windows SDK SignTool preflight before `electron-builder`, and load signing env via `import-csc-env.ps1` (avoids `${{ env.* }}` re-injection corrupting passwords).

## [2.1.9] - 2026-06-03

Fix repository `CSC_LINK` secrets that accidentally double-base64-encode the PFX.

### Fixed

- **CSC_LINK double base64** — `prepare-csc-link.ps1` detects PKCS#12 by DER header and unwraps nested base64 (common mistaken secret format) before PFX validation.

## [2.1.8] - 2026-06-03

Fix Windows release CI SignTool PFX load failures for repository signing secrets.

### Fixed

- **Windows CI SignTool PFX load** — Trim signing secrets, decode/validate repository `CSC_LINK` before packaging, write `GITHUB_ENV` without UTF-8 BOM, and preflight PFX + `publisherName` alignment so SignTool failures surface with actionable errors.

## [2.1.7] - 2026-06-03

Fix electron-builder 26 Windows signing configuration schema.

### Fixed

- **electron-builder 26 signtoolOptions** — Moved `publisherName` under `build.win.signtoolOptions` (removed invalid `build.win.publisherName` that broke CI validation).

## [2.1.6] - 2026-06-03

Fix Windows CI code signing for repository PFX secrets and publisher metadata.

### Fixed

- **electron-builder publisherName** — Set `build.win.signtoolOptions.publisherName` to `AI Shelf (Self-Signed)` so NSIS signing works when the certificate publisher cannot be auto-detected.
- **CSC_LINK base64 in CI** — Decode repository `CSC_LINK` secrets to a temp `.pfx` before signing to avoid PKCS#12 parse errors (`trailing data found`).

## [2.1.5] - 2026-06-03

Fix invalid GitHub Actions workflow conditions for release signing notices.

### Fixed

- **Release workflow validation** — Replaced disallowed `secrets.*` step `if` expressions with a `USE_REPO_SIGNING` env flag set during certificate configuration.

## [2.1.4] - 2026-06-03

Fix release workflow to read electron-builder signing secrets by their canonical names.

### Fixed

- **Release CI secret names** — Workflow now reads `CSC_LINK` / `CSC_KEY_PASSWORD` GitHub secrets (matching electron-builder) instead of `WIN_CSC_*`.
- **Base64 certificate support** — Signing preflight no longer requires `CSC_LINK` to be a local file path when the secret contains base64-encoded PFX data.

## [2.1.3] - 2026-06-03

Re-release with stable repository code-signing certificate configured for CI.

### Changed

- **Windows release signing** — CI now signs installers with the repository `CSC_LINK` / `CSC_KEY_PASSWORD` secrets, keeping the same publisher across releases for in-app update signature checks.

## [2.1.2] - 2026-06-03

Hotfix for Windows release CI producing unsigned installers.

### Fixed

- **Release CI signing** — Fixed fallback self-signed workflow overwriting `CSC_LINK` with a non-existent `.codesign/` path, which caused `AI-Shelf-Setup-*.exe` to ship unsigned and fail Authenticode verification.

## [2.1.1] - 2026-06-02

Release signing pipeline now prefers trusted certificates to avoid desktop in-app update signature trust failures.

### Changed

- **Windows release workflow** — `release.yml` now uses `CSC_LINK` / `CSC_KEY_PASSWORD` secrets first, and only falls back to generated self-signed certs when secrets are not configured.
- **CI release notices** — Added explicit workflow notices to show whether trusted signing or fallback self-signed signing was used for each release build.

### Fixed

- **Desktop updater trust path** — Avoided repeated updater signature failures caused by fresh per-run self-signed certificates by enabling stable trusted signing in CI.

## [2.1.0] - 2026-06-02

Profile group workflow, terminal/sidebar UX improvements, and single-instance desktop behavior.

### Added

- **Profile groups** — Added profile group commands and services in `ai-shelf` CLI/TUI, plus grouped profile tree in the desktop sidebar.
- **Desktop single-instance behavior** — Electron now enforces single-instance launch behavior and routes secondary launches to the existing window.
- **Top-bar plain shell action** — Added a plain shell quick action in terminal top bar / pane controls.
- **System tray runtime toggle** — Added settings and runtime sync for enabling/disabling tray behavior without restart.

### Changed

- **Sidebar architecture refresh** — Reworked terminal/profile sidebar composition to restore grouped workflow and improve interaction consistency.
- **Profile default tool behavior** — New terminals now use profile default tool icon and launch behavior more consistently.

### Fixed

- **Profile folder picker after switching** — Fixed intermittent failures when reopening folder picker after profile switches.
- **Profile layout persistence** — Preserved split layout reliably when switching profiles.
- **Sidebar shortcut handling** — Fixed `Ctrl+S` sidebar collapse toggle and related sidebar UX regressions.
- **Pane action stacking** — Prevented `+ Pane` menu stacking issues under the terminal UI.

## [2.0.0] - 2026-05-27

Major release: Profile-first data model, backup/restore, desktop polish, and automated npm + signed Windows installer on tag.

### Added

- **Profile-first model (2.0)** — Desktop and `ai-shelf` CLI/TUI share **Profile** as the primary unit; `ai-shelf profile` commands replace day-to-day `workspace` / `group` usage (legacy commands remain with warnings). See [docs/data-model.md](docs/data-model.md).
- **Data backup & restore** — Export/import profiles, layouts, SQLite DB, and app settings (`.aishelf` / JSON) from Terminal Settings; import backs up existing files and restarts the app.
- **Profile create templates** — Blank, copy-from-profile, and built-in templates (solo agent, multi-agent with broadcast, shell-only).
- **Windows self-signed Authenticode (CI)** — Release workflow signs the NSIS installer on every tag (SmartScreen may still warn; not CA-trusted). See [docs/WINDOWS_CODE_SIGNING.md](docs/WINDOWS_CODE_SIGNING.md).
- **npm publish on release** — Tag push also publishes the `ai-shelf` CLI package to npm (requires repo secret `NPM_TOKEN`; version synced from tag).
- **System tray** — Minimize to tray with profile quick-switch (Windows).
- **Collapsible profile sidebar** — Collapse/expand the profile list for more terminal space.
- **Customizable pane shortcuts** — Configure split and focus keyboard shortcuts in Settings.
- **Terminal output export** — Save PTY buffer to `.log` or copy for issue reports.
- **Skills inventory scan** — Discover real `SKILL.md` files across tool config paths.
- **Claude→Cursor MCP diff panel** — Inventory UI shows MCP gaps and one-click sync toward Cursor.
- **Codex MCP (TOML)** — MCP sync matrix includes Codex `config.toml` servers.
- **Crush & Goose** — Inventory detection for additional AI CLI tools.
- **Middle-click close** — Close a terminal tab from the profile sidebar with middle mouse button.

### Changed

- **Installation docs** — Desktop app is distributed via **GitHub Releases** installer only; `ai-shelf` CLI is built from source until installed from npm after publish.

### Fixed

- **Pane cwd picker** — Clicking the cwd control again opens the folder picker and respawns the pane in the new directory.

## [1.4.1] - 2026-05-26

Profile dialog visibility and terminal preservation when switching profiles.

### Fixed

- **Profile create/settings** — name and path fields visible in dialogs
- **Profile switch** — terminal sessions preserved when switching profiles

## [1.4.0] - 2026-05-26

Profile terminal minimize, sidebar drag placement, themes, and i18n.

### Added

- **Profile terminal minimize** — hide panes in the profile sidebar while sessions keep running; restore via click, restore button, or drag back to the main display
- **Sidebar drag onto panes** — drop profile tabs on a specific terminal with edge zones (above/below/left/right/swap); profile-scoped so terminals cannot cross profiles
- **App color themes** (light, dark, high contrast) with terminal chrome synced to the selected theme
- **Locale switching** — English and Chinese UI in Settings

### Fixed

- **Multi-pane clipboard** — paste works across split panes and via right-click again
- **Profile create** — accent color can be chosen when creating a profile
- **Pane drop overlays** — clickable above xterm for drag placement hints

## [1.3.0] - 2026-05-21

Terminal layout, display settings, right-click paste, and update-tab polish.

### Added

- **Drag-to-move terminal panes** — drop on top/bottom/left/right edges to insert, center to swap; works with multi-pane split layouts (sidebar tabs support above/below)
- **Right-click paste** in the terminal with a settings toggle
- **Terminal display settings** — font family, size, and scrollback buffer

### Changed

- **Update tab** skips version checks for tools that are not installed

### Fixed

- **Desktop update UX** — release notes render as HTML; app version shown in the window title

## [1.2.0] - 2026-05-21

Terminal search, clickable links in output, and desktop update UX polish.

### Added

- **Find in terminal output** — search bar with match navigation backed by a PTY output buffer API
- **Ctrl+click links** — open file paths and URLs directly from xterm output
- **Version badge** beside the app title with refresh in the inventory header

### Fixed

- **Windows in-app update** — reliable installer execution and clearer Update tab UX

## [1.1.1] - 2026-05-21

Hotfix for packaged desktop startup crash when loading in-app auto-update.

### Fixed

- **Desktop startup crash** — `electron-updater` is CommonJS; use default import so `autoUpdater` loads correctly under project ESM (`type: module`)

## [1.1.0] - 2026-05-21

Terminal UX improvements, version badge in the UI, and in-app desktop auto-update.

### Added

- **Editable terminal tab titles** — rename tabs inline
- **Pane keyboard shortcuts** — split, focus, and navigate panes from the keyboard
- **Per-pane working directory** — each pane keeps its own cwd with one-click folder open
- **Clear screen and restart session** shortcuts in the terminal
- **Scroll-to-bottom hint** and more reliable mouse wheel scrollback in the terminal
- **Version badge** in the desktop UI showing app version, git branch, and commit
- **In-app auto-update** for the Windows desktop app via `electron-updater` (requires `latest.yml` and blockmap assets on GitHub Releases)

### Changed

- Desktop update flow unified through a single confirm modal

### Notes

- This is the first release that ships **in-app auto-update**. Users on installers older than this build must upgrade **once manually** from [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases); later versions can update inside the app.

## [1.0.0] - 2026-05-20

First public release of **AI Shelf** — a unified toolkit to inspect, launch, and orchestrate AI coding CLIs on Windows.

### Added

#### Desktop app (Electron)

- **Terminal mode** — embedded xterm.js terminals with multi-pane splits, drag resize, and broadcast input across panes
- **Inventory mode** — seven-tab dashboard: Overview, Models, Skills, MCP, Config, Doctor, Update
- **Profiles** — create, rename, delete, and reorder profiles; per-profile split layouts persisted in SQLite
- **External launch** — open sessions in Windows Terminal, PowerShell 7+, PowerShell 5, or CMD
- **Detached windows** — optional pop-out chat and settings windows
- **Dark theme** — React UI with Tailwind CSS v4

#### Inventory CLI (`ai`)

- `ai inventory` — capability matrix, summary stats, warnings, and env-var checks
- Subcommands: `models`, `skills`, `mcp`, `config`
- `ai doctor` — parallel health checks (binary, auth, config)
- `ai update` — version check and update hints per tool and self
- `ai raw` — pass-through to underlying CLIs
- `--json` output on all inventory commands
- **MCP sync** — copy missing MCP servers across tools from the desktop UI

#### Workspace CLI (`ai-shelf`)

- Workspaces, groups, and PTY sessions backed by SQLite
- Launch sessions with optional AI tools: `claude`, `copilot`, `cursor`, `codex`, `gemini`, `aider`, `opencode`
- **Broadcast exec** — run the same command in all sessions in a group
- Full-screen **TUI** (`ai-shelf tui`) via neo-blessed
- Profiles API exported for the desktop app

#### Supported AI tools

- Claude Code, GitHub Copilot CLI, Cursor, OpenAI Codex CLI, Google Gemini CLI, Aider, OpenCode

#### Distribution & release

- Windows **NSIS installer** (`AI-Shelf-Setup-1.0.0.exe`) for end users via [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases)
- GitHub Actions workflow — build and attach installer on `v*` tags
- [Release guide](docs/RELEASE.md) for maintainers and Windows install instructions

#### Documentation

- [README](README.md) with feature overview and usage
- [Page-by-page desktop guide](docs/pages.md) with screenshots

### Notes

- Windows installers are **unsigned**; SmartScreen may prompt before first run (see [docs/RELEASE.md](docs/RELEASE.md)).
- Building from source requires Node.js ≥ 22 and pnpm ≥ 10.
- macOS and Linux desktop installers are not included in this release.

[2.1.17]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.17
[2.1.11]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.11
[2.1.10]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.10
[2.1.9]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.9
[2.1.8]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.8
[2.1.7]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.7
[2.1.6]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.6
[2.1.5]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.5
[2.1.4]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.4
[2.1.3]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.3
[2.1.2]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.2
[2.1.1]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.1
[2.1.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.1.0
[2.0.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v2.0.0
[1.4.1]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.4.1
[1.4.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.4.0
[1.3.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.3.0
[1.2.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.2.0
[1.1.1]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.1.1
[1.1.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.1.0
[1.0.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.0.0

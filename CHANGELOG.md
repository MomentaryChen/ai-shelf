# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

GitHub Releases use the matching `## [x.y.z]` section here as the release description (see `scripts/release-notes.mjs` and `.github/workflows/release.yml`).

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

[1.1.1]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.1.1
[1.1.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.1.0
[1.0.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.0.0

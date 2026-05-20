# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

GitHub Releases use the matching `## [x.y.z]` section here as the release description (see `scripts/release-notes.mjs` and `.github/workflows/release.yml`).

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

[1.0.0]: https://github.com/MomentaryChen/ai-shelf/releases/tag/v1.0.0

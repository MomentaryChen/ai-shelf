# AI Shelf

> Unified toolkit to inspect, launch, and orchestrate AI CLIs — Claude Code, GitHub Copilot, and Cursor — in one place.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文說明](README.zh-TW.md) · [Changelog](CHANGELOG.md)

**v1.0.0** — pnpm monorepo with an Electron desktop app, a lightweight inventory CLI (`ai`), and a terminal workspace manager (`ai-shelf`).

---

## What's in the repo

| Deliverable | Binary / entry | Role |
|---|---|---|
| **Inventory CLI** | `ai` | Scan models, skills, MCP, config; run doctor/update/raw |
| **Workspace CLI** | `ai-shelf` | Manage workspaces, groups, sessions; broadcast commands; TUI |
| **Desktop app** | `pnpm electron` | Terminal launcher + inventory dashboard (Electron + React) |

The desktop app uses both: inventory detection lives in `src/`, while profiles, layouts, and session metadata are backed by SQLite via `packages/cli`.

---

## Features

### Inventory (`ai`)

- **Overview** — capability matrix, summary stats, warnings, env-var presence
- **Models** — per-tool model chips with capability columns; long lists expand inline (`+N more`)
- **Skills** — per-tool skill cards + cross-tool skill matrix
- **MCP** — server inventory, sync status, cross-tool matrix, **MCP sync** (copy missing servers across tools)
- **Config** — config / instruction / MCP file paths, clickable to open
- **Doctor** — parallel health checks (binary, auth, config JSON)
- **Update** — version check and one-click update per tool and self
- **JSON output** — `--json` on every inventory command

### Terminal workspace (`ai-shelf`)

- **Workspaces & groups** — organize projects and terminal groups in SQLite
- **Sessions** — create/start/stop PTY sessions with optional AI tool launch (`claude`, `copilot`, `cursor`, `codex`, `gemini`, `aider`, `opencode`)
- **Broadcast exec** — send the same command to all running sessions in a group
- **TUI** — full-screen terminal UI (`ai-shelf tui`) built with neo-blessed
- **Profiles API** — exported library used by the desktop app for named terminal profiles

### Desktop app (Electron)

- **Two modes** — **Terminal** (default) and **Inventory** (7 tabs: Overview · Models · Skills · MCP · Config · Doctor · Update)
- **Profiles sidebar** — create/rename/delete profiles; each profile stores split-pane layout in SQLite
- **Embedded terminals** — xterm.js + node-pty; multi-pane split with drag resize; broadcast input across panes
- **External launch** — Windows Terminal, PowerShell 7+, PowerShell 5, or CMD
- **Detached windows** — optional pop-out chat and settings windows
- **Dark theme** — React + Tailwind CSS v4

---

## Supported tools

| Tool | Binary | Inventory id |
|---|---|---|
| Claude Code | `claude` | `claude` |
| GitHub Copilot CLI | `copilot` / `gh copilot` | `copilot` |
| Cursor | `agent` | `cursor` |
| OpenAI Codex CLI | `codex` | `codex` |
| Google Gemini CLI | `gemini` | `gemini` |
| Aider | `aider` | `aider` |
| OpenCode | `opencode` | `opencode` |

---

## Desktop app

![Overview](tests/screenshots/01.overview.png)

Switch between **Terminal** and **Inventory** in the header. Inventory mode has the tabbed dashboard above; Terminal mode is the embedded multi-pane launcher with a profiles sidebar.

→ **[Full page-by-page guide with screenshots](docs/pages.md)** · [繁體中文版](docs/pages.zh-TW.md)

---

## Installation

### Windows (desktop app)

1. Download **`AI-Shelf-Setup-<version>.exe`** from [GitHub Releases](https://github.com/MomentaryChen/ai-shelf/releases) (installer only — not portable builds).
2. Run the installer. If SmartScreen warns about an unknown publisher, choose **More info** → **Run anyway** (unsigned build).
3. Launch **AI Shelf** from the Start menu or desktop shortcut.

See [docs/RELEASE.md](docs/RELEASE.md) for maintainer release steps and uninstall notes.

### From npm (inventory CLI)

```bash
npm install -g ai-shelf   # exposes `ai` when published from root package
pnpm add -g ai-shelf
```

### From source (monorepo)

```bash
git clone <repo-url> ai-shelf
cd ai-shelf
pnpm install          # rebuilds native modules (node-pty, better-sqlite3)
pnpm build
pnpm start            # ai inventory / doctor / …
pnpm exec ai-shelf workspace list
pnpm electron         # desktop app
```

**Requirements:** Node.js ≥ 22, pnpm ≥ 10

---

## Usage

### Inventory CLI — `ai`

```
ai <command> [subcommand] [options]
```

#### `ai inventory` (alias: `ai inv`)

```bash
ai inventory            # full overview table
ai inventory models     # model + context info
ai inventory skills     # skills per tool
ai inventory mcp        # MCP server list
ai inventory config     # config & instruction file paths
ai inventory claude     # detail view for a single tool
```

**Example output:**

```
  AI Shelf

  TOOL             AUTH   MCP   MODEL                    CTX    STREAM   TOOLS   SKILLS
  ──────────────────────────────────────────────────────────────────────────────────────
  claude           ok     yes   claude-opus-4-5          200k   yes      yes     bash,edit,...
  copilot          ok     yes   gpt-4o                   128k   yes      yes     search,...
  cursor           ok     no    claude-3-5-sonnet         —     yes      yes     —

  MCP Servers: filesystem, github, postgres

  Config Files:
    ~/.claude.json
    ~/.config/gh/config.yml
```

#### `ai doctor`

```bash
ai doctor
ai doctor --json
```

Checks: binary in `PATH`, auth status, config JSON validity, MCP config JSON validity.

#### `ai raw <tool> [args...]`

```bash
ai raw claude --version
ai raw copilot auth status
```

#### `ai update [target]`

```bash
ai update              # all detected tools + self
ai update claude
ai update copilot
ai update cursor
ai update self
```

#### Global options

| Flag | Description |
|---|---|
| `--json` | Output as JSON |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

---

### Workspace CLI — `ai-shelf`

Persistent data (Windows):

| Path | Purpose |
|---|---|
| `%APPDATA%/ai-shelf/config.yaml` | App config |
| `%APPDATA%/ai-shelf/workspaces.db` | SQLite database |
| `%APPDATA%/ai-shelf/logs/app.log` | Logs |

```bash
# Workspaces
ai-shelf workspace create <name> [--root <path>]
ai-shelf workspace list
ai-shelf workspace delete <name>

# Groups (within a workspace)
ai-shelf group create <workspace> <group>
ai-shelf group list <workspace>
ai-shelf group delete <workspace> <group>

# Sessions
ai-shelf session create <workspace> <group> <name> [--cwd <path>] [--shell <shell>] [--tool <tool>]
ai-shelf session start <workspace> <group> <name>
ai-shelf session stop <workspace> <group> <name>
ai-shelf session list <workspace> [--group <name>]
ai-shelf session exec <workspace> <group> <command...> [--session <name>]
ai-shelf session exec <workspace> <group> <command...> --broadcast
ai-shelf session delete <workspace> <group> <name>

# Full-screen TUI
ai-shelf tui
```

See [`packages/cli/STRUCTURE.md`](packages/cli/STRUCTURE.md) for package internals.

---

## Development

```bash
pnpm install                 # postinstall rebuilds native addons for Electron

# TypeScript
pnpm dev                     # watch root src/ (inventory + electron main)
pnpm dev:cli                 # watch packages/cli
pnpm dev:renderer            # Vite dev server for React UI

# Build & run
pnpm build                   # CLI package + tsc + Vite renderer
pnpm start                   # node dist/cli.js  →  `ai` commands
pnpm electron                # build + launch desktop app
pnpm electron:dev            # electron without rebuild (after pnpm build)

# Native modules (node-pty for Electron)
pnpm rebuild:native          # current Electron ABI
pnpm rebuild:native:all      # all installed Electron versions

# Quality & packaging
pnpm test:e2e                # Playwright screenshot tests
pnpm lint
pnpm format / pnpm format:check
pnpm package:win             # standalone CLI exe (pkg)
pnpm dist:win                # Windows NSIS installer → release/AI-Shelf-Setup-<version>.exe
pnpm dist:win:portable       # dev-only portable exe (do not ship to users)
```

### Project structure

```
ai-shelf/                 # root workspace (Electron app + inventory CLI)
├── src/
│   ├── cli.ts                    # `ai` entry — inventory, doctor, raw, update
│   ├── commands/                 # CLI command handlers
│   ├── inventory/                # Claude / Copilot / Cursor detectors
│   ├── electron/                 # Main process, preload, workspace-host
│   ├── renderer/                 # React UI (Terminal + Inventory modes)
│   │   ├── components/           # ChatTab, ProfileSidebar, *Tab, …
│   │   ├── hooks/                # useInventoryScan, useProfileWorkspace, …
│   │   └── terminal/             # split-tree, layout serialize, SQLite sync
│   └── utils/
├── packages/cli/                 # `ai-shelf` workspace manager
│   └── src/
│       ├── cli/                  # Commander commands
│       ├── core/                 # ports, entities, errors
│       ├── database/             # SQLite + migrations + repositories
│       ├── services/             # workspace, group, session, profile, exec
│       ├── runtime/              # PTY, process registry, event bus
│       └── tui/                  # neo-blessed terminal UI
├── docs/pages.md                 # Desktop UI walkthrough (EN)
├── docs/pages.zh-TW.md           # Desktop UI walkthrough (zh-TW)
├── tests/e2e/                    # Playwright tests
└── scripts/                      # gen-icon, rebuild-native
```

### Tech stack

| Layer | Stack |
|---|---|
| Inventory CLI | Node.js, native `parseArgs` |
| Workspace CLI | Commander, better-sqlite3, node-pty, RxJS, Zod, Pino |
| Desktop | Electron 41, React 19, Vite 8, Tailwind CSS 4, xterm.js |
| Tests | Playwright |

---

## License

MIT

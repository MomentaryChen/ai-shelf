# AI CLI Inventory

> Unified CLI to inspect models, skills, MCP servers, and configs across Claude, GitHub Copilot, and Cursor — all in one place.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文說明](README.zh-TW.md)

---

## Features

- **Overview** — at-a-glance capability matrix with summary stats, warnings, and env-var presence
- **Models** — list available models per tool (via native CLI), switch default model with one click, expand collapsed lists with "load more"
- **Skills** — per-tool skill cards + cross-tool skill matrix
- **MCP** — full MCP server inventory with sync status and cross-tool matrix
- **Config** — all config, instruction, and MCP file paths per tool, clickable to open
- **Doctor** — parallel health checks (binary, auth, config JSON) shown as live cards
- **Update** — version check and one-click update for each tool and self, via native CLI
- **Chat** — embedded terminal (xterm.js + node-pty) to launch any AI tool directly in-app; supports multi-pane split view with drag-to-resize, or open in an external terminal (Windows Terminal, PowerShell, CMD)
- **JSON output** — machine-readable output for every CLI command
- **Electron GUI** — optional desktop app (dark theme)

## Supported Tools

| Tool | Binary |
|---|---|
| Claude Code | `claude` |
| GitHub Copilot CLI | `gh copilot` |
| Cursor | `agent` |

---

## Desktop GUI

![Overview](tests/screenshots/01.overview.png)

The Electron app has 8 tabs: **Overview · Chat · Models · Skills · MCP · Config · Doctor · Update**.  
→ **[Full page-by-page guide with screenshots](docs/pages.md)**

---

## Installation

```bash
# npm
npm install -g ai-cli-inventory

# pnpm
pnpm add -g ai-cli-inventory

# yarn
yarn global add ai-cli-inventory
```

---

## Usage

```
ai <command> [subcommand] [options]
```

### `ai inventory` (alias: `ai inv`)

Show a capability matrix for all detected AI tools.

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
  AI CLI Inventory

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

### `ai doctor`

Run health checks for each detected tool.

```bash
ai doctor
ai doctor --json
```

Checks performed:

- Binary found in `PATH`
- Auth status (`ok` / `missing` / `expired` / `unknown`)
- Config JSON validity
- MCP config JSON validity

### `ai raw <tool> [args...]`

Pass arguments directly to an underlying CLI binary.

```bash
ai raw claude --version
ai raw copilot auth status
```

### `ai update [target]`

Update AI tools or the inventory itself.

```bash
ai update              # update all detected tools + self
ai update claude       # update Claude Code only
ai update copilot      # update GitHub Copilot CLI only
ai update cursor       # update Cursor only
ai update self         # update ai-cli-inventory only
```

### Global Options

| Flag | Description |
|---|---|
| `--json` | Output as JSON |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

---

## Development

**Requirements:** Node.js ≥ 22, pnpm

```bash
# Install dependencies
pnpm install

# Watch mode (TypeScript)
pnpm dev

# Build
pnpm build

# Run CLI from build
pnpm start

# Launch Electron desktop app
pnpm electron

# Package as standalone Windows executable
pnpm package:win

# Build Windows installer (electron-builder)
pnpm dist:win
```

### Project Structure

```
src/
├── cli.ts              # CLI entry point & argument parsing
├── commands/
│   ├── inventory.ts    # inventory command
│   ├── doctor.ts       # doctor command
│   ├── raw.ts          # raw pass-through command
│   └── update.ts       # update command
├── inventory/
│   ├── index.ts        # detectAll() — runs all detectors
│   ├── claude.ts       # Claude detector
│   ├── copilot.ts      # Copilot detector
│   ├── cursor.ts       # Cursor detector
│   └── types.ts        # shared types (ProviderEntry, etc.)
├── electron/           # Electron main process + preload
├── renderer/           # React + Tailwind desktop UI
│   └── components/
│       ├── ChatTab.tsx          # embedded terminal launcher
│       ├── EmbeddedTerminal.tsx # xterm.js terminal pane
│       └── ...                  # OverviewTab, ModelsTab, etc.
└── utils/              # exec, config helpers
```

---

## License

MIT

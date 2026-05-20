# AI Shelf CLI — Terminal Workspace Manager

Phase 1: MVP foundation (SQLite + CLI + TUI skeleton + runtime layer).

## Commands

```bash
ai-shelf workspace create <name> [--root <path>]
ai-shelf workspace list
ai-shelf group create <workspace> <group>
ai-shelf group list <workspace>
ai-shelf session create <workspace> <group> <session> [--cwd <path>] [--shell <shell>]
ai-shelf session list <workspace> [--group <name>]
ai-shelf session exec <workspace> <group> <command> [--session <name>]
ai-shelf session exec <workspace> <group> <command> --broadcast
ai-shelf tui
```

## Data paths (Windows)

- Config: `%APPDATA%/ai-shelf/config.yaml`
- Database: `%APPDATA%/ai-shelf/workspaces.db`
- Logs: `%APPDATA%/ai-shelf/logs/app.log`

## Package layout

See `src/` — `core`, `models`, `database`, `services`, `runtime`, `infra`, `cli`, `tui`, `config`, `shared`.

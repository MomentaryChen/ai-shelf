# ai-cli-inventory CLI — Terminal Workspace Manager

Phase 1: MVP foundation (SQLite + CLI + TUI skeleton + runtime layer).

## Commands

```bash
ai-cli-inventory workspace create <name> [--root <path>]
ai-cli-inventory workspace list
ai-cli-inventory group create <workspace> <group>
ai-cli-inventory group list <workspace>
ai-cli-inventory session create <workspace> <group> <session> [--cwd <path>] [--shell <shell>]
ai-cli-inventory session list <workspace> [--group <name>]
ai-cli-inventory session exec <workspace> <group> <command> [--session <name>]
ai-cli-inventory session exec <workspace> <group> <command> --broadcast
ai-cli-inventory tui
```

## Data paths (Windows)

- Config: `%APPDATA%/ai-cli-inventory/config.yaml`
- Database: `%APPDATA%/ai-cli-inventory/workspaces.db`
- Logs: `%APPDATA%/ai-cli-inventory/logs/app.log`

## Package layout

See `src/` — `core`, `models`, `database`, `services`, `runtime`, `infra`, `cli`, `tui`, `config`, `shared`.

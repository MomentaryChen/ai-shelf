# AI Shelf CLI — Terminal Profile Manager

Phase 1 foundation (SQLite + CLI + TUI + runtime layer). **2.0 uses Profile as the primary user-facing model** — see [docs/data-model.md](../../docs/data-model.md).

## Commands

```bash
# Profiles (primary — same data as desktop app)
ai-shelf profile list
ai-shelf profile create <name> [--cwd <path>] [--tool <tool>] [--color <hex>]
ai-shelf profile update <profile> [--name] [--cwd] [--tool] [--broadcast|--no-broadcast] [--color]
ai-shelf profile delete <profile>
ai-shelf profile reorder <profile...>
ai-shelf profile exec <profile> <command...> [--broadcast] [--session <name>]

# Full-screen TUI (profile list + CLI sessions per profile)
ai-shelf tui

# Legacy (deprecated — prints warnings)
ai-shelf workspace create|list|delete …
ai-shelf group create|list|delete …
ai-shelf session create|start|stop|list|exec|delete …
```

## Data paths (Windows)

- Config: `%APPDATA%/ai-shelf/config.yaml`
- Database: `%APPDATA%/ai-shelf/workspaces.db`
- Logs: `%APPDATA%/ai-shelf/logs/app.log`

## Package layout

See `src/` — `core`, `models`, `database`, `services`, `runtime`, `infra`, `cli`, `tui`, `config`, `shared`.

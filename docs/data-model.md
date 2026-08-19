# Data model — Profile-first (2.0)

AI Shelf uses **one SQLite database** (`%APPDATA%/ai-shelf/workspaces.db` on Windows). The **desktop app** and **`ai-shelf` CLI/TUI** read and write the same file.

## User-facing model: Profile Group + Profile

A **profile group** is the top-level category, and **profiles** are organized under each group:

| Concept | Meaning |
|--------|---------|
| **Profile Group** | Category layer to split profiles (work / personal / client, etc.) |
| **Profile** | Named environment: default directory, default AI tool, accent color, broadcast-input flag |
| **Pane / terminal** | One embedded terminal (tool + cwd + optional title), up to 8 per profile |
| **Layout** | Split-pane tree persisted per profile |

Create and manage profiles with:

- Desktop: **Profile Groups + Profiles** sidebar
- CLI: `ai-shelf profile-group ...` and `ai-shelf profile ... --group <name>`

## Storage mapping (internal)

Profiles are stored using legacy table names for compatibility:

```
Profile Group  →  workspace row
Profile  →  group row in that workspace
Pane layout  →  group_layouts snapshot (JSON)
Last active profile  →  app_preferences.last_active_group (`groupId:profileId`)
Per-group last profile →  app_preferences.last_active_by_group (JSON map)
```

A default **`Profiles`** group is created automatically for compatibility, and you can create additional profile groups.

## CLI sessions vs desktop panes

| Surface | Live terminals | Persistence |
|--------|----------------|-------------|
| **Desktop app** | Electron `node-pty` in main process | Pane slots + layout in `group_layouts` |
| **CLI / TUI** | `SessionRuntime` PTY processes | `sessions` table under profile name |

Both share **profile metadata** (name, defaults, layout snapshot). Desktop panes and CLI named sessions are different runtime paths; use **`profile exec`** for headless command injection into CLI sessions.

## Deprecated legacy commands

These remain for backward compatibility but print deprecation warnings:

- `ai-shelf workspace …`
- `ai-shelf group …`
- `ai-shelf session …` (except when targeting `Profiles` + profile name for CLI sessions)

Prefer **`ai-shelf profile …`** for all new workflows.

## IPC (Electron)

The renderer uses profile APIs for the main UI:

- `profile-get-tree`, `profile-create`, `profile-update`, `profile-delete`, `profile-reorder`

`profile-update` may include `groupId` to move a profile to another profile group (workspace). Layout keys follow the new `workspaceId:profileId`.

Layout persistence still uses internal group-layout handlers (`ws-group-layout-*`) keyed by `workspaceId:groupId` — equivalent to profile storage keys.

Legacy workspace tree IPC (`ws-get-tree`, `ws-workspace-create`, …) remains for layout migration helpers but is not used by the desktop UI.

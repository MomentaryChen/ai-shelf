# AI Flow — Phase 2 scope

Phase 2 makes **MCP automation reliable**: progress via MCP tools (not stdout), a real multi-MCP example flow, and groundwork for runner environment + history UI.

## Phase 2a — MCP progress + weekly digest (this branch)

| Capability | Status |
|------------|--------|
| MCP server `ai-shelf-flow` with `flow_progress` tool | ✅ |
| MCP `flow_output` tool (writes final report) | ✅ |
| Runner injects `--mcp-config` + `--allowedTools` on `claude -p` | ✅ |
| `state.json` updated by MCP; UI sync via file watch | ✅ |
| Stdout `FLOW_PROGRESS` kept as fallback | ✅ |
| Seed `weekly-digest.flow.md` (Amplitude + Jira) | ✅ |
| In-app chat to create `.flow.md` | ✅ |

### In-app flow creation (chat)

AI Flow → **New flow** (or empty state) opens a warm chat panel. Describe the job in natural language; the app calls `claude -p` to draft a `.flow.md`, preview it, then **Save flow** to `%APPDATA%/ai-shelf/flows/`.

**Per-flow chat & prompt logs** (`%APPDATA%/ai-shelf/flow-chat/{flowId}/`):

| File | Contents |
|------|----------|
| `chat.json` | UI conversation (create / edit) |
| `prompts.jsonl` | Every `claude -p --input-format text` stdin payload (`generate` or `run`) |

Deleting a flow removes its `.flow.md`, `flow-chat/{id}/`, and matching `runs/*-{id}/` directories.

Requires Claude CLI installed and authenticated (same as running flows).

### MCP tools

Spawned as stdio server (`dist/flow/mcp-server.js`) with env:

| Variable | Purpose |
|----------|---------|
| `AISHELF_RUN_ID` | Active run id |
| `AISHELF_APP_DATA_DIR` | App data root |
| `AISHELF_FLOW_OUTPUT_PATH` | Target path for `flow_output` |

**`flow_progress`** — `{ type, phaseId, message? }` → updates `runs/{runId}/state.json`

**`flow_output`** — `{ content }` → writes markdown report

### weekly-digest

- Cron: Monday 09:00 `Asia/Taipei` (disabled by default until MCP is configured)
- Phases: `fetch-amplitude` → `fetch-jira` → `write-report`
- Requires Amplitude + Jira MCP in Claude config

### Headless validation (Task Scheduler)

Same as Phase 1 — `ai-shelf flow due` or `node dist/flow/cli.js due` runs flows with MCP progress when `claude -p` is available.

## Phase 2b — Runner environment (planned)

| Field | Purpose |
|-------|---------|
| `cwd` | Working directory for `claude -p` |
| `profile` | Bind Terminal profile (env, shell) |
| `allowed_tools` | Restrict MCP tool scope per flow |
| `mcp_config` | Optional extra MCP config path |

## Phase 2c — History UI

| Capability | Status |
|------------|--------|
| Per-flow run list (status / duration / progress) | ✅ |
| Event timeline per run (`events.jsonl`) | ✅ |
| Open `prompt.md` / `events.jsonl` / run folder | ✅ |
| Auto-open detail on failed run | ✅ |

## Architecture (Phase 2a)

```
runFlow()
  → write state.json, prompt.md
  → spawn claude -p --mcp-config (ai-shelf-flow server)
       → flow_progress / flow_output → state.json on disk
  → watchFile(state.json) → broadcast to FlowTab
```

See [flow-format.md](./flow-format.md), [ai-flow-phase0.md](./ai-flow-phase0.md), [ai-flow-phase1.md](./ai-flow-phase1.md).

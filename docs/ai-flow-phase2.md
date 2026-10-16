# AI Flow — Phase 2 scope

Phase 2 makes **MCP automation reliable**: progress via MCP tools (not stdout), a real multi-MCP example flow, and groundwork for runner environment + history UI.

## Phase 2a — MCP progress + weekly digest (this branch)

| Capability | Status |
|------------|--------|
| MCP server `ai-shelf-flow` with `flow_progress` tool | ✅ |
| MCP `flow_output` tool (writes final report) | ✅ |
| Runner injects `--strict-mcp-config` + `--tools ""` + `--allowedTools` on `claude -p` | ✅ |
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

### Headless validation (OS scheduler)

Same as Phase 1 — `ai-shelf flow due` or `node dist/flow/cli.js due` runs flows with MCP progress when `claude -p` is available.

## Phase 2b — Runner environment, DAG, validation, notifications

| Capability | Status |
|------------|--------|
| `cwd` — working directory for the agent | ✅ |
| `profile` — bind a Terminal profile (cwd / tool, `AISHELF_PROFILE_ID` / `AISHELF_PROFILE_NAME` env) | ✅ |
| Per-phase `profile` (orchestrated nodes; overrides the flow profile) | ✅ |
| `env:` map — extra environment variables (`${VAR}` expands from the app env); UI in Runner settings | ✅ |
| `extra_mcp_servers` — merge named MCP servers from Claude config (strict scope) | ✅ |
| `allowed_tools` — extra `--allowedTools` patterns for external MCP | ✅ |
| `tool_args` — CLI flags; default `--model haiku` | ✅ |
| Per-phase `depends_on` — DAG scheduling, independent phases run in parallel (`max_parallel`, default 4) | ✅ |
| Validation on save + before run: branch targets exist, no `next` / `on_fail` / `on_reject` loops, no dependency cycles, unknown / self deps, valid webhook URLs | ✅ |
| Validation surfaced in UI (flow header banner, sidebar marker, live check in View source, AI chat draft summary) | ✅ |
| Success notifications: `notify` (desktop policy), `on_success: slack` | ✅ |
| Generic `webhooks:` (URL / method / payload template / auth header; success and/or failure) | ✅ |
| Run history retention (max runs per flow / max age; app-wide + per-flow override; GC after each run, at startup, `flow prune`) | ✅ |

### Terminal profile binding

`profile: <id or name>` (flow or phase) resolves through the profile service: the profile's default
cwd fills `cwd` when unset (a phase profile always wins), its default tool is used when `tool` is
omitted, and the agent process gets `AISHELF_PROFILE_ID` / `AISHELF_PROFILE_NAME`. Profiles do not
store env vars or a shell yet, so extra variables come from the flow `env:` map. Agents are spawned
directly (cmd shim on Windows), not through the profile's interactive shell.

```yaml
profile: work
env:
  API_BASE: https://staging.example.com
  PATH: "${PATH};C:\\tools"
```

### DAG phases (`depends_on`)

```yaml
max_parallel: 2
phases:
  - id: fetch-amplitude
    depends_on: []          # root — starts immediately
  - id: fetch-jira
    depends_on: []          # runs in parallel with fetch-amplitude
  - id: write-report
    depends_on: [fetch-amplitude, fetch-jira]
```

- Any phase with `depends_on` switches the run to DAG scheduling (and multi-node orchestration).
- A phase **without** `depends_on` depends on the previous phase in the list, so mixed lists keep
  their sequential meaning; `depends_on: []` marks a root.
- Each node receives only its direct upstream outputs.
- `on_fail: skip` treats the node as resolved; `fail` (default) stops the run — running siblings are
  killed and pending nodes are skipped. `next` and branch jumps are rejected in DAG mode.
- Approval gates still work; concurrent gates are queued (one approval prompt at a time).
- Known limit: two **Cursor** phases in the same `cwd` share `.cursor/mcp.json`; run them sequentially.

### Validation

`validateFlowDefinition` (`src/shared/flow-validate.ts`) runs when a flow is created / saved
(chat save, View source save, runner / notification settings) and before every run. Invalid flows are
listed with a red marker, show an error banner, and cannot be started. `node dist/flow/cli.js list`
prints `INVALID: …` for them.

### Notifications & webhooks

```yaml
notify: failure            # desktop: all (default) | failure | success | none
on_fail: slack             # AISHELF_FLOW_SLACK_WEBHOOK
on_success: slack
webhooks:
  - url: https://hooks.example.com/flows?token=${HOOK_TOKEN}
    method: POST           # POST (default) | PUT | PATCH | GET
    on: both               # success | failure | both (default)
    authorization: Bearer ${HOOK_TOKEN}
    payload: '{"text": "{flow_id} {status} {error}"}'
```

Placeholders: `{flow_id}` `{run_id}` `{status}` `{error}` `{output_path}` `{duration_sec}`
`{started_at}` `{completed_at}` — JSON-escaped when the content type is JSON, URL-encoded for `GET`.
Empty `payload` sends a default JSON body. Webhook failures are logged and never fail the run.

### Run history retention

App-wide defaults live in `flow-schedule-pref.json` (`historyMaxRuns`, default 200; `historyMaxDays`,
default unlimited) and are edited in Flow settings → *Run history retention* (with *Clean up now*).
Per-flow overrides: `history_max_runs` / `history_max_days`. GC runs after each finished run, 30 s
after app start, and via `node dist/flow/cli.js prune [flowId]`. Live runs are never deleted; run
ownership is read from `state.json` so `digest` never prunes `weekly-digest` runs. Usage / cost
attribution only sees runs that are still on disk.

## Phase 2c — History UI

| Capability | Status |
|------------|--------|
| Per-flow run list (status / duration / progress) | ✅ |
| Event timeline per run (`events.jsonl`) | ✅ |
| Open `prompt.md` / `events.jsonl` / run folder | ✅ |
| Auto-open detail on failed run | ✅ |

## Architecture (Phase 2a / 2b)

```
runFlow()
  → write state.json, prompt.md
  → spawn claude -p --strict-mcp-config --tools "" --allowedTools (flow MCP + extra_mcp_servers)
       → flow_progress / flow_output → state.json on disk
  → watchFile(state.json) → broadcast to FlowTab

executeOrchestratedFlowRun()            (per-phase nodes)
  → depends_on? runDagPhases()  : runSequentialPhases()
       ready set (deps done/skipped) → up to max_parallel agents, per-phase MCP config
  → finished: notify (desktop / Slack / webhooks) → pruneFlowRunHistory()
```

See [flow-format.md](./flow-format.md), [ai-flow-phase0.md](./ai-flow-phase0.md), [ai-flow-phase1.md](./ai-flow-phase1.md).

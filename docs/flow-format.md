# Flow file format (`*.flow.md`)

Schema: `ai-shelf.flow/definition/v1`

## Example

```markdown
---
schema: ai-shelf.flow/definition/v1
id: weekly-digest
schedule: "0 9 * * 1"
timezone: Asia/Taipei
enabled: true
timeout_sec: 600
tool_args: --model haiku
extra_mcp_servers:
  - amplitude
  - atlassian
output: ~/automations/output/{date}-{id}.md
on_fail: slack
phases:
  - id: fetch-amplitude
    label: Pull Amplitude metrics
  - id: fetch-jira
    label: Query Jira issues
  - id: write-report
    label: Write report
---

# Weekly digest

## Steps
1. 【fetch-amplitude】Use MCP to query Amplitude: DAU, retention.
2. 【fetch-jira】Use MCP to query Jira: Done / In Progress.
3. 【write-report】Write the weekly report in Traditional Chinese.
```

## Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable identifier (filename without extension should match) |
| `enabled` | no | Default `true` |
| `schedule` | no | **Per-flow** cron expression; omit for manual-only |
| `timezone` | no | IANA timezone for this flow's schedule (default `Asia/Taipei`) |
| `timeout_sec` | no | Default `600` |
| `output` | no | Output path template; `{date}`, `{id}`, `{time}` |
| `runner` | no | `claude` (default) or `http` for direct fetch checks |
| `url` | when `runner: http` | Request URL |
| `method` | no | `HEAD` (default) or `GET` when `runner: http` |
| `phases` | no | UI checklist / orchestration nodes; auto-derived from `【phase-id】` in body if omitted |
| `orchestration` | no | Force multi-node mode; also auto when phases set `tool` / `kind` / `retry` / gate / `next` / `on_fail` |
| `tool_args` | no | CLI flags for the agent; default `--model haiku` when omitted |
| `extra_mcp_servers` | no | MCP server names merged from Claude config (strict scope — only these + `ai-shelf-flow`) |
| `allowed_tools` | no | Extra `--allowedTools` patterns for external MCP |
| `cwd` | no | Working directory for the agent process |
| `profile` | no | Terminal profile id/name — fills `cwd` / `tool`, exports `AISHELF_PROFILE_ID` / `AISHELF_PROFILE_NAME` |
| `env` | no | `KEY: value` map added to the agent environment (`${VAR}` expands) |
| `on_fail` / `on_success` | no | `slack` posts to `AISHELF_FLOW_SLACK_WEBHOOK` |
| `notify` | no | Desktop notifications: `all` (default) / `failure` / `success` / `none` |
| `webhooks` | no | List of `{ url, method, on, payload, content_type, authorization }` — see [ai-flow-phase2.md](./ai-flow-phase2.md) |
| `max_parallel` | no | Max concurrent phases in DAG mode (default 4, max 16) |
| `history_max_runs` / `history_max_days` | no | Per-flow run history retention overrides |

### Per-phase fields (under `phases:`)

| Field | Description |
|-------|-------------|
| `id` / `label` | Required id; label defaults from id |
| `tool` | `claude` / `cursor` / `codex` / `gemini` for this node |
| `tool_args` | Per-node CLI flags |
| `kind` | `agent` (default) / `gate` (human approve) / `http` |
| `retry` | Extra attempts after failure (0–10) |
| `on_fail` | `fail` (default) / `skip` / phase id to jump to |
| `require_approval` | Pause for approve before running the node |
| `next` | Next phase id after success (omit = next in list; empty = end) |
| `on_reject` | Branch when a gate is rejected (`fail` / `skip` / phase id) |
| `depends_on` | DAG dependencies (`[a, b]`, nested list, or `[]` for a root). Any `depends_on` enables parallel DAG scheduling; phases without it depend on the previous phase |
| `profile` | Terminal profile for this node (overrides the flow `profile`) |

Validation (on save and before each run) rejects unknown `next` / `on_fail` / `on_reject` / `depends_on`
targets, branch loops, dependency cycles, and jump branches in DAG mode.

## Multi-node orchestration

When enabled, each phase runs as a separate process. Upstream `runs/{runId}/phases/{id}/output.md` is injected into the next prompt. Human gates use run status `waiting_approval` and IPC `flow-approve-gate` / `flow-reject-gate`.

Legacy flows without per-phase orchestration fields still run as a single agent for the whole body.

## Run state (`runs/{runId}/state.json`)

Schema: `ai-shelf.flow/run-state/v1`

```json
{
  "schema": "ai-shelf.flow/run-state/v1",
  "runId": "20260630-090001-weekly-digest",
  "flowId": "weekly-digest",
  "status": "running",
  "phases": [{ "id": "fetch-amplitude", "label": "...", "status": "done" }],
  "progress": { "completed": 1, "total": 3, "percent": 33 }
}
```

## Progress protocol

**Primary (Phase 2+):** MCP tools on server `ai-shelf-flow`:

- `flow_progress` — `{ type, phaseId, message? }` updates `runs/{runId}/state.json`
- `flow_output` — `{ content }` writes the final markdown report (required on success **and** failure)

The runner passes `--strict-mcp-config`, `--mcp-config`, `--tools ""`, and `--allowedTools` to `claude -p`. Only the `ai-shelf-flow` MCP server is loaded unless `extra_mcp_servers` lists additional servers from your Claude config. Built-in tools (Bash, Read, etc.) are disabled.

Bundled system skills live in `src/flow/system-skills/*/SKILL.md` and are inlined into every agent run prompt. The runner also writes a fallback `output.md` when the agent exits without calling `flow_output`.

**Fallback:** stdout lines (legacy / when MCP unavailable):

```
FLOW_PROGRESS {"type":"phase.started","phaseId":"fetch-amplitude"}
FLOW_OUTPUT_BEGIN
(report body follows)
```

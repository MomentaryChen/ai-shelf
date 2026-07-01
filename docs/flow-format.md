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
| `phases` | no | UI checklist; auto-derived from `【phase-id】` in body if omitted |

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
- `flow_output` — `{ content }` writes the final markdown report

The runner passes `--mcp-config` and `--allowedTools mcp__ai-shelf-flow__*` to `claude -p`.

**Fallback:** stdout lines (legacy / when MCP unavailable):

```
FLOW_PROGRESS {"type":"phase.started","phaseId":"fetch-amplitude"}
FLOW_OUTPUT_BEGIN
(report body follows)
```

# AI Flow — Phase 0 scope

Phase 0 validates the **Chat → `.flow.md` → cron (later) → `claude -p` + MCP** model inside AI Shelf with a dedicated **AI Flow** app mode.

## V1 (Phase 0) — in scope

| Capability | Status |
|------------|--------|
| Third header mode **AI Flow** (alongside Terminal / Inventory) | ✅ |
| List flows from `%APPDATA%/ai-shelf/flows/*.flow.md` | ✅ |
| View flow metadata: schedule, phases, body preview | ✅ |
| Manual **Run** from UI | ✅ |
| Live **progress** from `runs/{runId}/state.json` | ✅ |
| Runner: `claude -p`, `FLOW_PROGRESS` parsing, output split | ✅ |
| Seed example flow on first launch | ✅ |
| Open flows folder | ✅ |

## V1 — out of scope

| Capability | Target |
|------------|--------|
| In-app cron / `flow due` scheduler | Phase 1 |
| Chat UI to generate flows | Phase 1 |
| Edit flow in UI | Phase 1 |
| MCP `flow-progress` tool (stdout protocol only for now) | Phase 2 |
| Run when app is closed (OS Task Scheduler + CLI) | Phase 1 |
| Inventory sub-nav duplicate tab | Use top-level mode instead |

## File layout (app data)

```
%APPDATA%/ai-shelf/
  flows/
    example-google-check.flow.md
  runs/
    {runId}/
      state.json
      events.jsonl
      output.md
```

## Flow definition (`*.flow.md`)

See [flow-format.md](./flow-format.md).

## Architecture

```
FlowTab (renderer)
  → IPC: flow-list, flow-run, flow-get-run-state, onFlowRunState
FlowService (electron main)
  → parse .flow.md
  → spawn claude -p (stream stdout)
  → update runs/{runId}/state.json
```

Cron (Phase 1) will call the same `FlowService.runFlow()` entry point.

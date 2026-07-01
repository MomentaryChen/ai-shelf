# AI Flow — Phase 1 scope

Phase 1 adds **scheduling**, **headless CLI**, and **failure notifications** on top of Phase 0.

## In scope

| Capability | Status |
|------------|--------|
| In-app cron tick (every 60s while app runs) | ✅ |
| Scheduler toggle in AI Flow UI | ✅ |
| `nextRunAt` on flow list | ✅ |
| `ai-shelf flow list` / `run` / `due` CLI | ✅ |
| OS Task Scheduler via `ai-shelf flow due` | ✅ (documented) |
| `on_fail: slack` via `AISHELF_FLOW_SLACK_WEBHOOK` | ✅ |
| Desktop notification on failed run (Electron) | ✅ |
| Shared runner in `src/flow/core.ts` | ✅ |
| Cursor rule to generate `.flow.md` | ✅ |

## Headless scheduling (app closed)

Create a Windows Task Scheduler job that runs every minute:

```powershell
# After `pnpm build` from repo root
node D:\path\to\ai-shelf\dist\flow\cli.js due
# or
pnpm exec ai-shelf flow due
```

`flow due` uses the same idempotent minute slot keys as the in-app scheduler (`flow-schedule-pref.json` → `lastSlots`).

## Slack on failure

Set in environment (user or machine):

```
AISHELF_FLOW_SLACK_WEBHOOK=https://hooks.slack.com/services/...
```

In `.flow.md` frontmatter:

```yaml
on_fail: slack
```

## Schedule prefs (app data)

`%APPDATA%/ai-shelf/flow-schedule-pref.json`:

```json
{
  "schedulerEnabled": true,
  "lastSlots": {
    "my-flow": "2026-06-30T09:00"
  }
}
```

## Architecture

```
FlowTab
  → flow-get/set-schedule-prefs
  → flow-run (manual)

flow-scheduler.ts (Electron main, 60s interval)
  → runDueFlows() when schedulerEnabled

ai-shelf flow due (CLI / Task Scheduler)
  → runDueFlows() (ignores schedulerEnabled toggle)

src/flow/core.ts
  → parse .flow.md, run http/claude, state.json, notify on fail
```

See also [flow-format.md](./flow-format.md) and [ai-flow-phase0.md](./ai-flow-phase0.md).

# AI Flow — Phase 1 scope

Phase 1 adds **scheduling**, **headless CLI**, and **failure notifications** on top of Phase 0.

## In scope

| Capability | Status |
|------------|--------|
| In-app cron tick (every 60s while app runs) | ✅ |
| Scheduler toggle in AI Flow UI | ✅ |
| `nextRunAt` on flow list | ✅ |
| `ai-shelf flow list` / `run` / `due` CLI | ✅ |
| OS scheduler via `ai-shelf flow due` (Windows Task Scheduler / macOS launchd / Linux systemd user timer) | ✅ |
| `on_fail: slack` via `AISHELF_FLOW_SLACK_WEBHOOK` | ✅ |
| Desktop notification on failed run (Electron) | ✅ |
| Shared runner in `src/flow/core.ts` | ✅ |
| Cursor rule to generate `.flow.md` | ✅ |

## Headless scheduling (app closed)

AI Flow → scheduler panel → **Run when app is closed** registers an OS job that runs `flow due`
every minute. Each flow's own cron is evaluated by `flow due`, so the OS job itself is always a
fixed 1-minute interval.

| Platform | Backend | What gets created |
|----------|---------|-------------------|
| Windows | Task Scheduler | Task `AI Shelf Flow Due` (`schtasks /SC MINUTE /MO 1`) running `%APPDATA%/ai-shelf/run-flow-due.cmd` |
| macOS | launchd | `~/Library/LaunchAgents/com.ai-shelf.flow-due.plist`, loaded with `launchctl bootstrap gui/<uid>`; removed with `launchctl bootout` |
| Linux | systemd user timer | `~/.config/systemd/user/ai-shelf-flow-due.{service,timer}` (`$XDG_CONFIG_HOME` respected), `systemctl --user daemon-reload` + `enable --now`; removed with `disable --now` |

On macOS / Linux the job runs the app's own Electron binary with `ELECTRON_RUN_AS_NODE=1` on
`dist/flow/cli.js due` (launchd and systemd do not inherit your login `PATH`, and this keeps the
native-module ABI identical to the app). launchd output goes to `<app data>/flow-due.log`; systemd
output goes to the user journal (`journalctl --user -u ai-shelf-flow-due`).

Limitations:

- **Linux without a systemd user session** (containers, WSL1, some minimal distros): the panel shows
  *Not available* with the `systemctl --user` error. Use a crontab entry instead:
  `* * * * * /path/to/ai-shelf flow due`.
- **Linux AppImage**: not supported — the AppImage mount path changes on every launch, so a
  persistent timer cannot point at it. Extract the AppImage or use the crontab entry above.

Manual setup still works everywhere:

```powershell
# After `pnpm build` from repo root
node D:\path\to\ai-shelf\dist\flow\cli.js due
# or
pnpm exec ai-shelf flow due
```

`flow due` uses the same idempotent minute slot keys as the in-app scheduler (`flow-schedule-pref.json` → `lastSlots`).

### Schedule mapping (`src/shared/os-schedule.ts`)

The OS backends share a small schedule model — `interval` (every N minutes) or `cron`
(5-field, same syntax as flows). The flow-due job only uses `interval: 1`; cron mapping is there
for future per-flow OS jobs and is unit-tested in `os-schedule.test.ts`.

| Schedule | Windows (`schtasks`) | macOS (launchd) | Linux (systemd timer) |
|----------|----------------------|-----------------|-----------------------|
| interval dividing 60 min (1, 5, 15, 30, 60…) | `/SC MINUTE /MO N` | `StartCalendarInterval`, one dict per minute value (clock aligned) | `OnCalendar=*-*-* *:00/N:00` (`*:*:00` for 1) |
| other interval | `/SC MINUTE /MO N` (max 1439) | `StartInterval` = N×60 s (not clock aligned) | `OnActiveSec=` + `OnUnitActiveSec=` (not clock aligned) |
| cron | **unsupported** | `StartCalendarInterval` array (cartesian product of restricted fields) | `OnCalendar=` with comma lists |
| cron + `timezone` | **unsupported** | **unsupported** (launchd uses the system zone) | appended to `OnCalendar=` (e.g. `… Asia/Taipei`) |
| cron restricting both day-of-month and day-of-week | **unsupported** | one dict per combination (launchd ORs `Day`/`Weekday` like cron) | two `OnCalendar=` lines (systemd unions them) |
| cron expanding to > 500 launchd dicts | **unsupported** | **unsupported** | supported |
| 6-field cron, `L` / `W` / `#` / `?`, `@reboot` | **unsupported** | **unsupported** | **unsupported** |

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

ai-shelf flow due (CLI / Task Scheduler / launchd / systemd timer)
  → runDueFlows() when schedulerEnabled

src/flow/core.ts
  → parse .flow.md, run http/claude, state.json, notify on fail
```

See also [flow-format.md](./flow-format.md) and [ai-flow-phase0.md](./ai-flow-phase0.md).

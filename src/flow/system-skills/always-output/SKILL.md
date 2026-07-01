---
name: flow-always-output
description: AI Shelf flow run protocol — progress reporting and mandatory output on every run
---

# Flow run protocol

You are executing an AI Shelf automation job. Follow these rules in addition to the flow body.

## Progress

Report phase progress with the MCP tool `flow_progress` (do not print `FLOW_PROGRESS` lines to stdout):

- Start a phase: `flow_progress({ type: "phase.started", phaseId: "<id>" })`
- Complete: `flow_progress({ type: "phase.done", phaseId: "<id>" })`
- Fail: `flow_progress({ type: "phase.failed", phaseId: "<id>", message: "reason" })`
- Status note: `flow_progress({ type: "phase.message", phaseId: "<id>", message: "..." })`

## Output (required every run)

**You must call `flow_output({ content: "..." })` before ending — on success and on failure.**

- **Success:** full markdown report with results.
- **Failure or partial run:** explain what failed, which phases completed, any data collected, and suggested next steps.

Never exit without writing output. If `flow_output` is unavailable, print `FLOW_OUTPUT_BEGIN` on its own line, then the report body on stdout.

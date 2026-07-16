---
schema: ai-shelf.flow/definition/v1
id: multi-agent-review
enabled: false
timeout_sec: 600
orchestration: true
phases:
  - id: research
    label: Research with Claude
    tool: claude
    tool_args: --model haiku
  - id: review
    label: Human review
    kind: gate
    on_reject: fail
  - id: polish
    label: Polish with Cursor
    tool: cursor
    retry: 1
    on_fail: skip
---

# Multi-agent review pipeline

Each phase runs as its own agent. Upstream output is injected automatically.

## 【research】
Summarize the current topic in 5 bullet points. Call `flow_output` with the bullets.

## 【review】
(Human gate — no agent work.)

## 【polish】
Rewrite the upstream research bullets into a short Traditional Chinese briefing. Call `flow_output` with the final text.

---
schema: ai-shelf.flow/definition/v1
id: daily-standup
enabled: true
timeout_sec: 300
tool_args: --model haiku
phases:
  - id: gather
    label: Gather updates
  - id: summarize
    label: Write standup notes
---

# Daily standup

## Steps

1. 【gather】Ask what I accomplished yesterday, what I plan today, and any blockers. Keep it brief.
2. 【summarize】Write a concise standup note in bullet form. Use the same language I used in the chat.

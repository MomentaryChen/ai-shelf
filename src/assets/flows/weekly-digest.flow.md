---
schema: ai-shelf.flow/definition/v1
id: weekly-digest
schedule: "0 9 * * 1"
timezone: Asia/Taipei
enabled: false
timeout_sec: 600
tool_args: --model haiku
extra_mcp_servers:
  - amplitude
  - atlassian
output: ~/automations/output/{date}-{id}.md
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

1. 【fetch-amplitude】Use MCP to query Amplitude: DAU, retention, and notable trends for the past week.
2. 【fetch-jira】Use MCP to query Jira: issues completed and in progress this week.
3. 【write-report】Write the weekly report in Traditional Chinese with clear sections and bullet points.

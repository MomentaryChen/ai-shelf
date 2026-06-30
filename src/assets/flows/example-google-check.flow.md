---
schema: ai-shelf.flow/definition/v1
id: example-google-check
enabled: true
timeout_sec: 15
runner: http
url: https://www.google.com
method: HEAD
phases:
  - id: check-google
    label: Connect to google.com
---

# Google connectivity check

A minimal flow: HEAD request to `https://www.google.com`.

No Claude CLI required — the app runs this check directly.

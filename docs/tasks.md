# Task file format (`*.task.md`)

Each task is one file in the app data `tasks/` folder (`%APPDATA%/ai-shelf/tasks/` on Windows). The app writes these files, and you can also edit them by hand.

## Example

```markdown
---
id: review-branch
name: Review this branch
description: Compare the current branch with main
profile: 3f2a9c1e-…        # profile id or exact profile name; omit to use the active profile
tool: codex                # omit to use the profile's default tool
---

Review the changes on the current branch against main.
List bugs first, then risky changes, then style nits.
```

## Fields

| Field         | Required | Description                                                                                   |
| ------------- | -------- | --------------------------------------------------------------------------------------------- |
| `id`          | no       | Must match the file name (`<id>.task.md`). The file name wins if they differ.                 |
| `name`        | yes      | Display name                                                                                  |
| `description` | no       | One line shown under the name                                                                 |
| `profile`     | no       | Profile id, or a profile name. Empty: the active profile                                      |
| `tool`        | no       | Agent CLI id (`claude`, `codex`, `gemini`, `cursor`, …). Empty: the profile's default tool    |

The body after the frontmatter is the prompt, sent unchanged as the agent's first message.

## How a run works

1. AI Shelf switches to the task's profile and opens a new pane in the profile's folder with the agent CLI, in interactive mode.
2. The main process waits until the agent's screen stops changing, then pastes the prompt (bracketed paste) and presses Enter. Typing is used instead of a launch argument, so quotes and new lines in the prompt survive every shell (cmd, PowerShell, bash, WSL, SSH).
3. If the screen shows a start-up dialog (folder trust, login, API key), nothing is sent until you answer it. After 10 minutes on the dialog, the prompt is dropped.

A plain-shell profile (no agent CLI installed) cannot run tasks.

## One terminal per task

Each task is a card on the Tasks page. Click the card to run it.

A task has at most one terminal. While that terminal is open, the card shows **Terminal open** and a click switches to it instead of sending the prompt again. Close the terminal to run the task again. The link is saved with the profile layout. A terminal restored after a restart still belongs to its task when it resumes the same agent conversation; a terminal that starts a new conversation (resume turned off, a tool without resume, an SSH profile, or **Start new conversation**) is released, and the card runs the task again.

## Migration from AI Flow

On the first start after the upgrade, each `flows/*.flow.md` becomes `tasks/<id>.task.md`:

- `name` comes from the flow's `# Title`, and `profile` carries over.
- The body becomes the prompt, with `【phase】` markers removed.
- `runner: http` flows and flows with an empty body are skipped.

`flows/` and `runs/` are not deleted. A `tasks/.migrated-from-flows` marker keeps the conversion from running again.

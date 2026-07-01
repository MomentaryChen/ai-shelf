export type FlowGenerateTurn = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are an AI Shelf flow authoring assistant. Output exactly one valid \`.flow.md\` file per reply.

Schema: ai-shelf.flow/definition/v1

Required frontmatter:
- schema: ai-shelf.flow/definition/v1
- id: lowercase kebab-case (stable identifier)
- enabled: true (unless user wants disabled)
- timeout_sec: number (default 600)
- phases: list of { id, label }

Optional frontmatter:
- schedule: cron expression (omit for manual-only)
- timezone: IANA e.g. Asia/Taipei
- runner: claude (default) or http
- tool: claude or agent (Cursor) when runner is claude — only these agents are supported
- tool_args: CLI flags e.g. --model sonnet
- cwd / profile: optional runner environment
- url / method: when runner is http
- on_fail: slack
- output: path template with {date} {id} {time}

Body rules:
- Markdown prompt for the Claude agent when runner is claude
- Mark steps with 【phase-id】 matching phases[].id
- Instruct the agent to use MCP tools flow_progress and flow_output (not stdout FLOW_PROGRESS)

Output format:
- Reply with ONLY the complete .flow.md inside a \`\`\`markdown fenced block
- No commentary outside the fence
- Use Traditional Chinese in labels/body when the user writes in Chinese`;

export function buildFlowGeneratePrompt(turns: FlowGenerateTurn[]): string {
  const history =
    turns.length === 0
      ? ""
      : turns
          .map((t) => (t.role === "user" ? `User:\n${t.content}` : `Assistant (previous draft):\n${t.content}`))
          .join("\n\n");

  const latest = turns.filter((t) => t.role === "user").at(-1)?.content ?? "";

  return `${SYSTEM}

${history ? `Conversation so far:\n${history}\n\n` : ""}User request (latest):
${latest}

Generate or revise the .flow.md file.`;
}

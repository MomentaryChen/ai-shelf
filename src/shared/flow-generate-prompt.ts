export type FlowGenerateTurn = { role: "user" | "assistant"; content: string };

export type FlowGenerateMcpInventory = {
  /** Enabled Claude MCP server names available on this machine. */
  enabled: string[];
  /** Disabled servers (still known — do not invent others). */
  disabled?: string[];
  policyRequired?: string[];
  policyForbidden?: string[];
};

export type BuildFlowGeneratePromptOptions = {
  /** Canonical `.flow.md` on disk when editing an existing flow. */
  currentFlowMd?: string | null;
  /** Live Claude MCP inventory + team policy constraints. */
  mcpInventory?: FlowGenerateMcpInventory | null;
};

/** Max chars per older user turn in the generate prompt. */
export const FLOW_GENERATE_MAX_USER_CHARS = 800;
/** Max chars for the single working draft block. */
export const FLOW_GENERATE_MAX_DRAFT_CHARS = 8_000;
/** Keep at most this many prior user turns (excluding the latest request). */
export const FLOW_GENERATE_MAX_PRIOR_USERS = 6;

const SYSTEM = `You are an AI Shelf flow authoring assistant. Output exactly one valid \`.flow.md\` file per reply.

Schema: ai-shelf.flow/definition/v1

Required frontmatter:
- schema: ai-shelf.flow/definition/v1
- id: lowercase kebab-case (stable identifier)
- enabled: true (unless user wants disabled)
- timeout_sec: number (default 600)
- phases: list of { id, label }

Optional frontmatter:
- schedule: cron expression (omit for manual-only; minimum interval 1 hour between fires)
- timezone: IANA e.g. Asia/Taipei
- runner: claude (default) or http
- tool: claude or agent (Cursor) when runner is claude — only these agents are supported
- tool_args: CLI flags — default \`--model haiku\` for claude runner (use sonnet/opus only when needed)
- extra_mcp_servers: list of MCP server names from the inventory below when the flow needs external MCP
- allowed_tools: optional extra \`--allowedTools\` patterns (e.g. mcp__atlassian__jira_search)
- cwd / profile: optional runner environment
- url / method: when runner is http
- on_fail: slack
- output: path template with {date} {id} {time}

Body rules:
- Markdown prompt for the Claude agent when runner is claude
- Mark steps with 【phase-id】 matching phases[].id
- Instruct the agent to use MCP tools flow_progress and flow_output (not stdout FLOW_PROGRESS)
- System skills (e.g. mandatory output) are injected by the runner — do not duplicate in frontmatter

Authoring checklist (must satisfy):
- Keep the same id unless the user explicitly asks to rename
- phases[].id and every 【phase-id】 marker stay in sync
- extra_mcp_servers ⊆ available inventory; never invent server names
- Never include policy-forbidden MCP servers; include policy-required ones when the flow needs MCP
- Prefer flow_progress / flow_output over stdout progress lines
- Reply with ONLY the complete .flow.md inside a \`\`\`markdown fenced block (no commentary outside)
- Use Traditional Chinese in labels/body when the user writes in Chinese`;

/** Truncate long text with a middle ellipsis so head + tail stay useful. */
export function truncateMiddle(text: string, maxChars: number): string {
  const s = text.trim();
  if (s.length <= maxChars) return s;
  if (maxChars < 32) return s.slice(0, maxChars);
  const head = Math.ceil((maxChars - 21) * 0.55);
  const tail = maxChars - 21 - head;
  return `${s.slice(0, head)}\n\n…[truncated]…\n\n${s.slice(-tail)}`;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Compact chat turns for generate: user history only + one working draft.
 * Drops older assistant drafts, dedupes consecutive identical users, truncates.
 */
export function compactFlowGenerateTurns(turns: FlowGenerateTurn[]): {
  priorUsers: string[];
  latestUser: string;
  workingDraft: string | null;
} {
  const users: string[] = [];
  let workingDraft: string | null = null;

  for (const turn of turns) {
    const content = turn.content?.trim() ?? "";
    if (!content) continue;
    if (turn.role === "user") {
      const prev = users.at(-1);
      if (prev && normalizeText(prev) === normalizeText(content)) continue;
      users.push(content);
    } else {
      workingDraft = content;
    }
  }

  const latestUser = truncateMiddle(users.at(-1) ?? "", FLOW_GENERATE_MAX_USER_CHARS * 2);
  const priorRaw = users.slice(0, -1).slice(-FLOW_GENERATE_MAX_PRIOR_USERS);
  const priorUsers = priorRaw.map((u) => truncateMiddle(u, FLOW_GENERATE_MAX_USER_CHARS));

  return {
    priorUsers,
    latestUser,
    workingDraft: workingDraft ? truncateMiddle(workingDraft, FLOW_GENERATE_MAX_DRAFT_CHARS) : null,
  };
}

function extractFlowIdHint(flowMd: string): string | null {
  const match = /^id:\s*([a-z0-9][a-z0-9_-]*)\s*$/im.exec(flowMd);
  return match?.[1] ?? null;
}

function resolveWorkingDraft(
  fromTurns: string | null,
  currentFlowMd?: string | null,
): { draft: string | null; fromDisk: boolean; diskIdHint: string | null } {
  const disk = currentFlowMd?.trim() || null;
  const chat = fromTurns?.trim() || null;
  const diskIdHint = disk ? extractFlowIdHint(disk) : null;
  if (chat && disk) {
    if (normalizeText(chat) === normalizeText(disk)) {
      return {
        draft: truncateMiddle(disk, FLOW_GENERATE_MAX_DRAFT_CHARS),
        fromDisk: true,
        diskIdHint,
      };
    }
    // Prefer in-chat draft for iterative revise; keep disk id as a hard hint.
    return {
      draft: truncateMiddle(chat, FLOW_GENERATE_MAX_DRAFT_CHARS),
      fromDisk: false,
      diskIdHint,
    };
  }
  if (chat) {
    return {
      draft: truncateMiddle(chat, FLOW_GENERATE_MAX_DRAFT_CHARS),
      fromDisk: false,
      diskIdHint: null,
    };
  }
  if (disk) {
    return {
      draft: truncateMiddle(disk, FLOW_GENERATE_MAX_DRAFT_CHARS),
      fromDisk: true,
      diskIdHint,
    };
  }
  return { draft: null, fromDisk: false, diskIdHint: null };
}

function formatMcpInventory(inv: FlowGenerateMcpInventory): string {
  const enabled = inv.enabled.filter(Boolean);
  const disabled = (inv.disabled ?? []).filter(Boolean);
  const required = (inv.policyRequired ?? []).filter(Boolean);
  const forbidden = (inv.policyForbidden ?? []).filter(Boolean);

  const lines = [
    "MCP inventory (Claude config on this machine — use only these names in extra_mcp_servers):",
    enabled.length ? `- Available (enabled): ${enabled.join(", ")}` : "- Available (enabled): (none)",
  ];
  if (disabled.length) {
    lines.push(`- Known but disabled: ${disabled.join(", ")}`);
  }
  if (required.length) {
    lines.push(`- Team policy required: ${required.join(", ")}`);
  }
  if (forbidden.length) {
    lines.push(`- Team policy forbidden (never use): ${forbidden.join(", ")}`);
  }
  return lines.join("\n");
}

export function buildFlowGeneratePrompt(
  turns: FlowGenerateTurn[],
  options: BuildFlowGeneratePromptOptions = {},
): string {
  const { priorUsers, latestUser, workingDraft } = compactFlowGenerateTurns(turns);
  const { draft, fromDisk, diskIdHint } = resolveWorkingDraft(workingDraft, options.currentFlowMd);

  const history =
    priorUsers.length === 0
      ? ""
      : priorUsers.map((u, i) => `User (${i + 1}):\n${u}`).join("\n\n");

  const draftLabel = fromDisk
    ? "Current .flow.md on disk (canonical — revise this file; keep the same id unless the user explicitly asks to rename)"
    : "Current working draft (single source — revise this; do not restate older drafts)";

  const diskHintBlock =
    !fromDisk && diskIdHint
      ? `On-disk flow id is \`${diskIdHint}\` (file may differ from the working draft — keep this id unless the user explicitly asks to rename).\n\n`
      : "";

  const draftBlock = draft
    ? `${draftLabel}:\n\`\`\`markdown\n${draft}\n\`\`\`\n\n`
    : "";

  const mcpBlock =
    options.mcpInventory != null ? `${formatMcpInventory(options.mcpInventory)}\n\n` : "";

  return `${SYSTEM}

${mcpBlock}${diskHintBlock}${draftBlock}${history ? `Prior user requests:\n${history}\n\n` : ""}User request (latest):
${latestUser}

Generate or revise the .flow.md file.`;
}

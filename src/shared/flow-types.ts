export const FLOW_DEFINITION_SCHEMA = "ai-shelf.flow/definition/v1" as const;
export const FLOW_RUN_STATE_SCHEMA = "ai-shelf.flow/run-state/v1" as const;

export type FlowPhaseStatus = "pending" | "running" | "done" | "skipped" | "failed";

export type FlowRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface FlowPhaseDef {
  id: string;
  label: string;
}

export interface FlowDefinition {
  schema: typeof FLOW_DEFINITION_SCHEMA;
  id: string;
  fileName: string;
  filePath: string;
  enabled: boolean;
  /** `claude` (default) or `http` for simple connectivity checks without Claude CLI. */
  runner: "claude" | "http";
  /** Used when runner is `http`. */
  httpUrl?: string;
  httpMethod: "GET" | "HEAD";
  schedule?: string;
  timezone?: string;
  timeoutSec: number;
  outputTemplate?: string;
  onFail: "slack" | "none";
  /** CLI tool id when runner is `claude` (default `claude`). */
  agentTool: string;
  /** When true, `profile` may supply the tool if frontmatter omits `tool`. */
  profileInheritsTool: boolean;
  /** Extra CLI flags for the agent tool, e.g. `--model opus`. */
  toolArgs?: string;
  /** Working directory for the agent process. */
  cwd?: string;
  /** Profile id/name — fills `cwd` / `tool` when omitted. */
  profileId?: string;
  /** MCP server names from Claude config to merge at run time (`extra_mcp_servers`). */
  extraMcpServers?: string[];
  /** Extra tool permission patterns for `--allowedTools` (`allowed_tools`). */
  agentAllowedTools?: string[];
  phases: FlowPhaseDef[];
  body: string;
}

export interface FlowPhaseRunState {
  id: string;
  label: string;
  status: FlowPhaseStatus;
  startedAt: string | null;
  completedAt: string | null;
  message: string | null;
}

export interface FlowRunState {
  schema: typeof FLOW_RUN_STATE_SCHEMA;
  runId: string;
  flowId: string;
  status: FlowRunStatus;
  startedAt: string;
  updatedAt: string;
  currentPhaseId: string | null;
  progress: { completed: number; total: number; percent: number };
  phases: FlowPhaseRunState[];
  outputPath: string | null;
  error: string | null;
  logPath: string;
}

export interface FlowProgressEvent {
  type:
    | "phase.started"
    | "phase.done"
    | "phase.failed"
    | "phase.skipped"
    | "phase.message";
  phaseId?: string;
  message?: string;
}

export interface FlowListItem {
  id: string;
  fileName: string;
  enabled: boolean;
  schedule?: string;
  phaseCount: number;
  /** ISO timestamp of next cron fire, when scheduled. */
  nextRunAt?: string | null;
}

export const FLOW_DEFINITION_SCHEMA = "ai-shelf.flow/definition/v1" as const;
export const FLOW_RUN_STATE_SCHEMA = "ai-shelf.flow/run-state/v1" as const;

export type FlowPhaseStatus =
  | "pending"
  | "running"
  | "done"
  | "skipped"
  | "failed"
  | "waiting_approval";

export type FlowRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "waiting_approval";

/** How a phase node is executed by the orchestrator. */
export type FlowPhaseKind = "agent" | "gate" | "http";

/**
 * After retries are exhausted (or a gate is rejected):
 * - `fail` — fail the run
 * - `skip` — mark phase skipped and continue
 * - any other string — jump to that phase id
 */
export type FlowPhaseBranch = "fail" | "skip" | (string & {});

export interface FlowPhaseDef {
  id: string;
  label: string;
  /** Defaults to `agent`. `gate` pauses for human approve/reject. */
  kind?: FlowPhaseKind;
  /** Per-phase CLI tool (claude / cursor / codex / gemini). Inherits flow `tool` when omitted. */
  tool?: string;
  /** Per-phase CLI flags; inherits flow `tool_args` when omitted. */
  toolArgs?: string;
  /** Per-phase timeout; inherits flow `timeout_sec` when omitted. */
  timeoutSec?: number;
  /** Extra attempts after the first failure (default 0). */
  retry?: number;
  /** Branch after retries exhausted. Default `fail`. */
  onFail?: FlowPhaseBranch;
  /** Pause for human approval before this phase runs. */
  requireApproval?: boolean;
  /** Explicit next phase id after success. Omit = next in list; empty = end run. */
  next?: string;
  /** Branch when a gate is rejected. Default `fail`. */
  onReject?: FlowPhaseBranch;
}

export interface FlowDefinition {
  schema: typeof FLOW_DEFINITION_SCHEMA;
  id: string;
  fileName: string;
  filePath: string;
  enabled: boolean;
  /** `claude` (default) or `http` for simple connectivity checks without Claude CLI. */
  runner: "claude" | "http";
  /**
   * When true, run phases as separate nodes (per-tool spawn, I/O piping, gates).
   * Also auto-enabled when any phase sets tool / kind / retry / gate / next / on_fail.
   */
  orchestration?: boolean;
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
  /** Per-phase artifact path when orchestration writes node output. */
  outputPath?: string | null;
  /** Attempt count (1 = first try). */
  attempts?: number;
  /** Resolved tool for this phase (orchestration). */
  tool?: string | null;
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
  /** True when this run uses the multi-node orchestrator. */
  orchestration?: boolean;
  /** Phase waiting for human approve/reject (when status is waiting_approval). */
  pendingGatePhaseId?: string | null;
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

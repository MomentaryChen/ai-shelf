import type {
  FlowDefinition,
  FlowPhaseBranch,
  FlowPhaseDef,
  FlowPhaseKind,
} from "./flow-types.js";

const PHASE_TAG_RE = /【([a-z0-9][a-z0-9_-]*)】/gi;

/** True when this flow should run as a multi-node orchestrator (not one agent for all phases). */
export function flowUsesNodeOrchestration(flow: FlowDefinition): boolean {
  if (flow.runner === "http") return false;
  if (flow.orchestration === true) return true;
  return flow.phases.some(
    (p) =>
      p.kind === "gate" ||
      p.kind === "http" ||
      (typeof p.tool === "string" && p.tool.trim().length > 0) ||
      (typeof p.retry === "number" && p.retry > 0) ||
      p.requireApproval === true ||
      typeof p.next === "string" ||
      typeof p.onFail === "string" ||
      typeof p.onReject === "string",
  );
}

export function phaseKind(phase: FlowPhaseDef): FlowPhaseKind {
  if (phase.kind === "gate" || phase.kind === "http" || phase.kind === "agent") {
    return phase.kind;
  }
  return "agent";
}

export function phaseRetryLimit(phase: FlowPhaseDef): number {
  if (typeof phase.retry === "number" && phase.retry > 0) {
    return Math.min(Math.floor(phase.retry), 10);
  }
  return 0;
}

export function resolvePhaseBranch(
  branch: FlowPhaseBranch | undefined,
  fallback: FlowPhaseBranch = "fail",
): FlowPhaseBranch {
  if (branch === undefined || branch === null || branch === "") return fallback;
  return branch;
}

/**
 * Extract the markdown section for a phase id from the flow body.
 * Sections are delimited by `【phase-id】` markers (heading or inline).
 */
export function extractPhaseBody(body: string, phaseId: string): string {
  const target = phaseId.toLowerCase();
  const text = body.trim();
  if (!text) return "";

  const matches = [...text.matchAll(PHASE_TAG_RE)];
  if (matches.length === 0) return text;

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]!;
    const id = match[1]!.toLowerCase();
    if (id !== target) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? text.length) : text.length;
    const section = text.slice(start, end).trim();
    return section || text;
  }

  return text;
}

export type PhaseOutputContext = {
  id: string;
  label: string;
  content: string;
};

/** Build the prompt for a single orchestrated agent phase. */
export function buildPhaseRunPrompt(options: {
  flowBody: string;
  phase: FlowPhaseDef;
  previousOutputs: PhaseOutputContext[];
  systemSkillsBlock?: string;
}): string {
  const { flowBody, phase, previousOutputs, systemSkillsBlock } = options;
  const section = extractPhaseBody(flowBody, phase.id);
  const prior =
    previousOutputs.length === 0
      ? ""
      : `

---
【上游節點輸出 — 請當作輸入使用】

${previousOutputs
  .map(
    (o) => `### 【${o.id}】${o.label}\n\n${o.content.trim() || "(empty)"}`,
  )
  .join("\n\n")}`;

  return `# Phase: 【${phase.id}】${phase.label}

${section}${prior}${systemSkillsBlock ? `\n\n${systemSkillsBlock}` : ""}

---
【執行協議 — 系統注入，請遵守】

你只負責這一個 phase（id: ${phase.id}）。
完成後請呼叫 MCP \`flow_output\`（或 stdout 輸出 \`FLOW_OUTPUT_BEGIN\` 後接報告本文）寫出本節點的結果。
可用 \`flow_progress\` 回報進度；失敗時也請寫出 output 說明原因。`;
}

/** Resolve the next phase id after a successful phase. */
export function nextPhaseIdAfterSuccess(
  phases: FlowPhaseDef[],
  currentId: string,
): string | null {
  const current = phases.find((p) => p.id === currentId);
  if (!current) return null;
  if (typeof current.next === "string") {
    const trimmed = current.next.trim();
    if (trimmed === "") return null;
    return trimmed;
  }
  const idx = phases.findIndex((p) => p.id === currentId);
  if (idx < 0 || idx + 1 >= phases.length) return null;
  return phases[idx + 1]!.id;
}

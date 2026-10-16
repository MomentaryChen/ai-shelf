import { findDependencyCycle, findGraphCycle, flowUsesDagScheduling } from "./flow-dag.js";
import { nextPhaseIdAfterSuccess } from "./flow-orchestration.js";
import { isValidHttpFlowUrl, parseFlowDocument } from "./flow-parse.js";
import type { FlowDefinition, FlowPhaseBranch } from "./flow-types.js";

export type FlowValidationIssueCode =
  | "duplicate-phase"
  | "unknown-branch-target"
  | "unknown-dependency"
  | "self-dependency"
  | "dependency-cycle"
  | "branch-loop"
  | "dag-branch-unsupported"
  | "invalid-webhook-url";

export type FlowValidationIssue = {
  code: FlowValidationIssueCode;
  message: string;
  phaseId?: string;
};

function isJumpBranch(branch: FlowPhaseBranch | undefined): branch is string {
  if (typeof branch !== "string") return false;
  const v = branch.trim();
  return v !== "" && v !== "fail" && v !== "skip";
}

/**
 * Static checks run before a flow is saved or started: branch targets must exist,
 * `depends_on` must reference known phases without cycles, and `next` / `on_fail` /
 * `on_reject` jumps must not form a loop (at runtime only the phase-visit cap in
 * flow-loop-guard.ts would stop one, after spawning several paid agent runs).
 */
export function validateFlowDefinition(flow: FlowDefinition): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const ids = new Set<string>();
  for (const phase of flow.phases) {
    if (ids.has(phase.id)) {
      issues.push({
        code: "duplicate-phase",
        phaseId: phase.id,
        message: `Duplicate phase id "${phase.id}"`,
      });
    }
    ids.add(phase.id);
  }

  const dag = flowUsesDagScheduling(flow.phases);

  for (const phase of flow.phases) {
    const branches: [string, string | undefined][] = [
      ["next", typeof phase.next === "string" && phase.next.trim() ? phase.next.trim() : undefined],
      ["on_fail", isJumpBranch(phase.onFail) ? phase.onFail.trim() : undefined],
      ["on_reject", isJumpBranch(phase.onReject) ? phase.onReject.trim() : undefined],
    ];
    for (const [field, target] of branches) {
      if (!target) continue;
      if (!ids.has(target)) {
        issues.push({
          code: "unknown-branch-target",
          phaseId: phase.id,
          message: `Phase "${phase.id}": ${field} target "${target}" does not exist`,
        });
      } else if (dag) {
        issues.push({
          code: "dag-branch-unsupported",
          phaseId: phase.id,
          message: `Phase "${phase.id}": ${field} jumps are not supported when phases use depends_on (use fail or skip)`,
        });
      }
    }

    for (const dep of phase.dependsOn ?? []) {
      if (dep === phase.id) {
        issues.push({
          code: "self-dependency",
          phaseId: phase.id,
          message: `Phase "${phase.id}" depends on itself`,
        });
      } else if (!ids.has(dep)) {
        issues.push({
          code: "unknown-dependency",
          phaseId: phase.id,
          message: `Phase "${phase.id}": depends_on "${dep}" does not exist`,
        });
      }
    }
  }

  if (dag) {
    const selfLoops = new Set(
      issues.filter((i) => i.code === "self-dependency").map((i) => i.phaseId),
    );
    const cycle = findDependencyCycle(flow.phases);
    if (cycle && !(cycle.length === 2 && selfLoops.has(cycle[0]))) {
      issues.push({
        code: "dependency-cycle",
        phaseId: cycle[0],
        message: `Dependency cycle: ${cycle.join(" → ")}`,
      });
    }
  } else {
    // Control-flow graph: success edge, skip edge (same as success), and jump targets.
    const edges = new Map<string, string[]>();
    for (const phase of flow.phases) {
      const targets = new Set<string>();
      const next = nextPhaseIdAfterSuccess(flow.phases, phase.id);
      if (next) targets.add(next);
      if (isJumpBranch(phase.onFail)) targets.add(phase.onFail.trim());
      if (isJumpBranch(phase.onReject)) targets.add(phase.onReject.trim());
      edges.set(
        phase.id,
        [...targets].filter((t) => ids.has(t)),
      );
    }
    const loop = findGraphCycle(edges);
    if (loop) {
      issues.push({
        code: "branch-loop",
        phaseId: loop[0],
        message: `Phase loop: ${loop.join(" → ")}`,
      });
    }
  }

  (flow.webhooks ?? []).forEach((hook, index) => {
    // `${ENV}` placeholders are resolved at send time; only check literal URLs.
    if (hook.url.includes("${")) return;
    if (!isValidHttpFlowUrl(hook.url)) {
      issues.push({
        code: "invalid-webhook-url",
        message: `webhooks[${index}]: url must be an absolute http or https URL`,
      });
    }
  });

  return issues;
}

export function formatFlowValidationIssues(issues: FlowValidationIssue[]): string {
  return issues.map((i) => i.message).join("\n");
}

/** Parse + validate raw `.flow.md` content. */
export function validateFlowContent(
  content: string,
  fileName = "draft.flow.md",
):
  | { ok: true; flow: FlowDefinition }
  | { ok: false; error: string; issues: FlowValidationIssue[] } {
  const parsed = parseFlowDocument(content, fileName, "");
  if ("error" in parsed) return { ok: false, error: parsed.error, issues: [] };
  const issues = validateFlowDefinition(parsed);
  if (issues.length > 0) {
    return { ok: false, error: formatFlowValidationIssues(issues), issues };
  }
  return { ok: true, flow: parsed };
}

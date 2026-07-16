import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import {
  FLOW_RUN_STATE_SCHEMA,
  type FlowProgressEvent,
  type FlowRunState,
} from "../shared/flow-types.js";

export function runsDir(): string {
  return join(getAppDataDir(), "runs");
}

export function runDirFor(runId: string): string {
  return join(runsDir(), runId);
}

export function readRunState(runId: string): FlowRunState | null {
  const statePath = join(runDirFor(runId), "state.json");
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as FlowRunState;
  } catch {
    return null;
  }
}

export function writeRunState(runDir: string, state: FlowRunState): void {
  state.updatedAt = new Date().toISOString();
  writeFileSync(join(runDir, "state.json"), JSON.stringify(state, null, 2), "utf8");
}

export function appendRunEvent(runDir: string, event: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), ...event });
  appendFileSync(join(runDir, "events.jsonl"), `${line}\n`, "utf8");
}

export function recomputeRunProgress(state: FlowRunState): void {
  const total = state.phases.length;
  const completed = state.phases.filter((p) => p.status === "done" || p.status === "skipped").length;
  state.progress = {
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
  };
}

export function applyProgressEventToState(
  state: FlowRunState,
  event: FlowProgressEvent,
): boolean {
  if (!event.phaseId) return false;
  const phase = state.phases.find((p) => p.id === event.phaseId);
  if (!phase) return false;

  const now = new Date().toISOString();
  switch (event.type) {
    case "phase.started":
      phase.status = "running";
      phase.startedAt = phase.startedAt ?? now;
      state.currentPhaseId = event.phaseId;
      break;
    case "phase.done":
      phase.status = "done";
      phase.completedAt = now;
      if (event.message) phase.message = event.message;
      break;
    case "phase.failed":
      phase.status = "failed";
      phase.completedAt = now;
      phase.message = event.message ?? "failed";
      // Orchestrated runs decide fail/retry/branch themselves — MCP must not abort the run.
      if (!state.orchestration) {
        state.status = "failed";
        state.error = event.message ?? `Phase ${event.phaseId} failed`;
      }
      break;
    case "phase.skipped":
      phase.status = "skipped";
      phase.completedAt = now;
      break;
    case "phase.message":
      phase.message = event.message ?? phase.message;
      break;
    default:
      return false;
  }
  recomputeRunProgress(state);
  return true;
}

export function applyProgressToRun(
  runId: string,
  event: FlowProgressEvent,
): { ok: boolean; state?: FlowRunState; error?: string } {
  const runDir = runDirFor(runId);
  const state = readRunState(runId);
  if (!state) {
    return { ok: false, error: `Run not found: ${runId}` };
  }
  if (state.schema !== FLOW_RUN_STATE_SCHEMA) {
    return { ok: false, error: "Invalid run state schema" };
  }

  const applied = applyProgressEventToState(state, event);
  if (!applied) {
    return { ok: false, error: "Unknown phase or invalid event" };
  }

  writeRunState(runDir, state);
  appendRunEvent(runDir, {
    type: event.type,
    phaseId: event.phaseId,
    message: event.message,
    source: "mcp",
  });
  return { ok: true, state };
}

export function writeRunOutput(
  runId: string,
  content: string,
): { ok: boolean; outputPath?: string; error?: string } {
  const runDir = runDirFor(runId);
  const state = readRunState(runId);
  if (!state) {
    return { ok: false, error: `Run not found: ${runId}` };
  }

  const outputPath = process.env["AISHELF_FLOW_OUTPUT_PATH"]?.trim() || join(runDir, "output.md");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");

  state.outputPath = outputPath;
  writeRunState(runDir, state);
  appendRunEvent(runDir, { type: "flow.output", outputPath, source: "mcp" });
  return { ok: true, outputPath };
}

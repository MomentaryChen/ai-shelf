import { type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import {
  buildPhaseRunPrompt,
  flowUsesNodeOrchestration,
  nextPhaseIdAfterSuccess,
  phaseKind,
  phaseRetryLimit,
  resolvePhaseBranch,
  type PhaseOutputContext,
} from "../shared/flow-orchestration.js";
import {
  FLOW_DEFAULT_MAX_PARALLEL,
  flowUsesDagScheduling,
  phaseDependencies,
  readyDagPhaseIds,
} from "../shared/flow-dag.js";
import { FLOW_OUTPUT_BEGIN, FLOW_PROGRESS_PREFIX } from "../shared/flow-protocol.js";
import type {
  FlowDefinition,
  FlowPhaseBranch,
  FlowPhaseDef,
  FlowPhaseRunState,
  FlowPhaseStatus,
  FlowProgressEvent,
  FlowRunState,
} from "../shared/flow-types.js";
import type { ToolLaunchArgs } from "../tool-launch.js";
import { spawnAgentPrint } from "./claude-spawn.js";
import { resolvePhaseRunner } from "./flow-runner-resolve.js";
import { formatSystemSkillsSection, loadFlowSystemSkills } from "./flow-system-skills.js";
import { prepareFlowAgentSpawn } from "./mcp-config.js";
import {
  appendRunEvent,
  readRunState,
  recomputeRunProgress,
  writeRunState,
} from "./run-state-store.js";

export { flowUsesNodeOrchestration };

export type OrchestratorRunContext = {
  flowId: string;
  runId: string;
  runDir: string;
  state: FlowRunState;
  child?: ChildProcess;
  /** All live agent processes (parallel DAG phases); cancel kills every entry. */
  children?: Set<ChildProcess>;
  timeout?: NodeJS.Timeout;
  stopWatching?: () => void;
  mcpCleanup?: () => void;
  cancelled: boolean;
};

export type OrchestratorHooks = {
  broadcastState: (state: FlowRunState) => void;
  killChild: (child: ChildProcess) => void;
  watchStateFile: (runId: string, state: FlowRunState) => () => void;
  emitConsole?: (payload: {
    phaseId: string | null;
    stream: "stdout" | "stderr";
    data: string;
  }) => void;
};

type GateDecision = "approve" | "reject";

type GateWaiter = {
  resolve: (decision: GateDecision) => void;
};

const gateWaiters = new Map<string, GateWaiter>();

function writeState(ctx: OrchestratorRunContext, hooks: OrchestratorHooks): void {
  writeRunState(ctx.runDir, ctx.state);
  hooks.broadcastState(ctx.state);
}

/**
 * Look up the live phase record. Always re-read: the state-file watcher may replace
 * `ctx.state.phases` with the copy the MCP server wrote, so captured references go stale.
 */
function phaseRunState(
  ctx: OrchestratorRunContext,
  phaseId: string,
): FlowPhaseRunState | undefined {
  return ctx.state.phases.find((p) => p.id === phaseId);
}

function appendEvent(ctx: OrchestratorRunContext, event: Record<string, unknown>): void {
  appendRunEvent(ctx.runDir, event);
}

function parseProgressLine(line: string): FlowProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(FLOW_PROGRESS_PREFIX)) return null;
  const jsonPart = trimmed.slice(FLOW_PROGRESS_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as FlowProgressEvent;
    if (parsed && typeof parsed.type === "string") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function releaseMcp(ctx: OrchestratorRunContext): void {
  if (!ctx.mcpCleanup) return;
  const cleanup = ctx.mcpCleanup;
  ctx.mcpCleanup = undefined;
  cleanup();
}

function phaseOutputPath(runDir: string, phaseId: string): string {
  const dir = join(runDir, "phases", phaseId);
  mkdirSync(dir, { recursive: true });
  return join(dir, "output.md");
}

function readPhaseOutput(runDir: string, phaseId: string): string {
  const path = phaseOutputPath(runDir, phaseId);
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function collectPreviousOutputs(
  flow: FlowDefinition,
  state: FlowRunState,
  runDir: string,
  beforePhaseId: string,
): PhaseOutputContext[] {
  const out: PhaseOutputContext[] = [];
  // DAG mode: only direct upstream dependencies feed this node.
  const upstream = flowUsesDagScheduling(flow.phases)
    ? new Set(phaseDependencies(flow.phases, beforePhaseId))
    : null;
  for (const phase of flow.phases) {
    if (upstream) {
      if (!upstream.has(phase.id)) continue;
    } else if (phase.id === beforePhaseId) {
      break;
    }
    const runPhase = state.phases.find((p) => p.id === phase.id);
    if (!runPhase || (runPhase.status !== "done" && runPhase.status !== "skipped")) continue;
    const content =
      (runPhase.outputPath && existsSync(runPhase.outputPath)
        ? readFileSync(runPhase.outputPath, "utf8")
        : readPhaseOutput(runDir, phase.id)) || "";
    if (!content.trim() && runPhase.status === "skipped") continue;
    out.push({ id: phase.id, label: phase.label, content });
  }
  return out;
}

async function waitForGate(
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  phase: FlowPhaseDef,
): Promise<GateDecision> {
  const runPhase = ctx.state.phases.find((p) => p.id === phase.id);
  if (runPhase) {
    runPhase.status = "waiting_approval";
    runPhase.message = "Waiting for approval";
    runPhase.startedAt = runPhase.startedAt ?? new Date().toISOString();
  }
  ctx.state.status = "waiting_approval";
  ctx.state.currentPhaseId = phase.id;
  ctx.state.pendingGatePhaseId = phase.id;
  appendEvent(ctx, { type: "gate.waiting", phaseId: phase.id });
  writeState(ctx, hooks);

  return new Promise<GateDecision>((resolve) => {
    gateWaiters.set(ctx.flowId, {
      resolve: (decision) => {
        gateWaiters.delete(ctx.flowId);
        resolve(decision);
      },
    });
  });
}

export function resolveFlowGate(
  flowId: string,
  decision: GateDecision,
): { ok: boolean; error?: string } {
  const waiter = gateWaiters.get(flowId);
  if (!waiter) {
    return { ok: false, error: "No approval gate waiting for this flow" };
  }
  waiter.resolve(decision);
  return { ok: true };
}

export function cancelFlowGateWait(flowId: string): void {
  const waiter = gateWaiters.get(flowId);
  if (!waiter) return;
  gateWaiters.delete(flowId);
  waiter.resolve("reject");
}

function applyPhaseBranch(
  flow: FlowDefinition,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  phase: FlowPhaseDef,
  branch: FlowPhaseBranch,
  reason: string,
): string | null | "failed" {
  const runPhase = ctx.state.phases.find((p) => p.id === phase.id);
  const now = new Date().toISOString();

  if (branch === "fail") {
    if (runPhase) {
      runPhase.status = "failed";
      runPhase.completedAt = now;
      runPhase.message = reason;
    }
    ctx.state.status = "failed";
    ctx.state.error = reason;
    ctx.state.currentPhaseId = null;
    ctx.state.pendingGatePhaseId = null;
    recomputeRunProgress(ctx.state);
    appendEvent(ctx, { type: "phase.failed", phaseId: phase.id, message: reason });
    writeState(ctx, hooks);
    return "failed";
  }

  if (branch === "skip") {
    if (runPhase) {
      runPhase.status = "skipped";
      runPhase.completedAt = now;
      runPhase.message = reason;
    }
    recomputeRunProgress(ctx.state);
    appendEvent(ctx, { type: "phase.skipped", phaseId: phase.id, message: reason });
    writeState(ctx, hooks);
    return nextPhaseIdAfterSuccess(flow.phases, phase.id);
  }

  const target = branch.trim();
  if (!flow.phases.some((p) => p.id === target)) {
    ctx.state.status = "failed";
    ctx.state.error = `Unknown branch target "${target}" from phase ${phase.id}`;
    ctx.state.currentPhaseId = null;
    writeState(ctx, hooks);
    return "failed";
  }

  if (runPhase) {
    runPhase.status = "skipped";
    runPhase.completedAt = now;
    runPhase.message = `${reason} → ${target}`;
  }
  recomputeRunProgress(ctx.state);
  appendEvent(ctx, {
    type: "phase.branch",
    phaseId: phase.id,
    target,
    message: reason,
  });
  writeState(ctx, hooks);
  return target;
}

async function runAgentPhaseOnce(
  flow: FlowDefinition,
  phase: FlowPhaseDef,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  outputPath: string,
  globalToolLaunchArgs?: ToolLaunchArgs,
): Promise<{ ok: boolean; error?: string }> {
  const resolved = resolvePhaseRunner(flow, phase, { globalToolLaunchArgs });
  if ("error" in resolved) {
    return { ok: false, error: resolved.error };
  }

  const runPhase = phaseRunState(ctx, phase.id);
  if (runPhase) {
    runPhase.tool = resolved.tool;
    runPhase.outputPath = outputPath;
    runPhase.profileId = resolved.profileId ?? null;
  }

  const previous = collectPreviousOutputs(flow, ctx.state, ctx.runDir, phase.id);
  const skills = formatSystemSkillsSection(loadFlowSystemSkills());
  const prompt = buildPhaseRunPrompt({
    flowBody: flow.body,
    phase,
    previousOutputs: previous,
    systemSkillsBlock: skills,
  });

  writeFileSync(join(ctx.runDir, "phases", phase.id, "prompt.md"), prompt, "utf8");

  const prep = prepareFlowAgentSpawn(
    resolved.tool,
    ctx.runId,
    outputPath,
    resolved.cwd,
    {
      extraMcpServers: flow.extraMcpServers,
      agentAllowedTools: flow.agentAllowedTools,
    },
    { configKey: phase.id },
  );
  // Per-phase cleanup (parallel phases each own their MCP mount / temp config).
  let mcpCleanup: (() => void) | undefined = prep.mcpMount.cleanup;
  const releasePhaseMcp = () => {
    const cleanup = mcpCleanup;
    mcpCleanup = undefined;
    cleanup?.();
  };

  const env = {
    ...process.env,
    ...resolved.env,
    AISHELF_RUN_ID: ctx.runId,
    AISHELF_APP_DATA_DIR: getAppDataDir(),
    AISHELF_FLOW_OUTPUT_PATH: outputPath,
    AISHELF_FLOW_PHASE_ID: phase.id,
  };

  const timeoutSec = phase.timeoutSec ?? flow.timeoutSec;

  return new Promise((resolve) => {
    let settled = false;
    let outputMode = false;
    const outputChunks: string[] = [];
    let stderr = "";
    let stdoutBuf = "";
    let timer: NodeJS.Timeout | undefined;
    let spawned: ChildProcess | undefined;

    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      releasePhaseMcp();
      if (spawned) {
        ctx.children?.delete(spawned);
        if (ctx.child === spawned) ctx.child = undefined;
      }
      resolve(result);
    };

    let child: ChildProcess;
    try {
      child = spawnAgentPrint({
        launchCommand: resolved.launchCommand,
        cwd: resolved.cwd,
        prompt,
        env,
        printPrefix: prep.printPrefix,
        args: prep.extraArgs,
        promptDelivery: prep.promptDelivery,
        promptLog: { flowId: flow.id, kind: "run", runId: ctx.runId },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      finish({ ok: false, error: message });
      return;
    }
    spawned = child;
    ctx.child = child;
    (ctx.children ??= new Set()).add(child);

    hooks.emitConsole?.({
      phaseId: phase.id,
      stream: "stdout",
      data: `\n── ${phase.id}${phase.label ? ` · ${phase.label}` : ""} ──\n`,
    });

    timer = setTimeout(() => {
      if (settled || ctx.cancelled) return;
      hooks.killChild(child);
      finish({ ok: false, error: `Timed out after ${timeoutSec}s` });
    }, timeoutSec * 1000);

    const handleLine = (line: string) => {
      if (settled || ctx.cancelled) return;
      if (!outputMode) {
        if (line.trim() === FLOW_OUTPUT_BEGIN) {
          outputMode = true;
          return;
        }
        const progress = parseProgressLine(line);
        if (progress) {
          // Message-only updates during orchestration; control flow stays with orchestrator.
          if (progress.type === "phase.message" && progress.phaseId === phase.id && runPhase) {
            runPhase.message = progress.message ?? runPhase.message;
            writeState(ctx, hooks);
          }
          return;
        }
      }
      if (outputMode) outputChunks.push(line);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      hooks.emitConsole?.({ phaseId: phase.id, stream: "stdout", data: text });
      stdoutBuf += text;
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      hooks.emitConsole?.({ phaseId: phase.id, stream: "stderr", data: text });
      stderr += text;
    });

    child.on("close", (code) => {
      if (ctx.cancelled) {
        finish({ ok: false, error: "Cancelled" });
        return;
      }
      if (stdoutBuf) handleLine(stdoutBuf);

      const disk = readRunState(ctx.runId);
      if (disk?.outputPath && existsSync(disk.outputPath) && disk.outputPath === outputPath) {
        // MCP flow_output may have written already
      }

      const body = outputChunks.join("\n").trim();
      if (body && !existsSync(outputPath)) {
        writeFileSync(outputPath, `${body}\n`, "utf8");
      } else if (!existsSync(outputPath) && stdoutBuf.trim() && !outputMode) {
        writeFileSync(outputPath, `${stdoutBuf.trim()}\n`, "utf8");
      }

      // Prefer MCP-written file; otherwise captured stdout.
      if (!existsSync(outputPath) && body) {
        writeFileSync(outputPath, `${body}\n`, "utf8");
      }

      if (code !== 0) {
        finish({
          ok: false,
          error: stderr.trim() || `Agent exited with code ${code ?? "unknown"}`,
        });
        return;
      }

      if (!existsSync(outputPath)) {
        writeFileSync(
          outputPath,
          `# Phase ${phase.id}\n\n(Agent completed without explicit output.)\n`,
          "utf8",
        );
      }

      finish({ ok: true });
    });

    child.on("error", (err) => {
      finish({ ok: false, error: err.message });
    });
  });
}

async function runHttpPhase(
  flow: FlowDefinition,
  phase: FlowPhaseDef,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  outputPath: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = flow.httpUrl;
  if (!url) {
    return { ok: false, error: "HTTP phase requires flow url" };
  }
  try {
    const res = await fetch(url, {
      method: flow.httpMethod,
      signal: AbortSignal.timeout((phase.timeoutSec ?? flow.timeoutSec) * 1000),
    });
    const body = [
      `# HTTP check — ${phase.id}`,
      "",
      `- URL: ${url}`,
      `- Method: ${flow.httpMethod}`,
      `- Status: ${res.status} ${res.statusText}`,
      `- OK: ${res.ok}`,
    ].join("\n");
    writeFileSync(outputPath, `${body}\n`, "utf8");
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeFileSync(outputPath, `# HTTP check failed\n\n${message}\n`, "utf8");
    return { ok: false, error: message };
  }
}

type OrchestratorOptions = { globalToolLaunchArgs?: ToolLaunchArgs };

type AttemptResult = { ok: true } | { ok: false; error: string; stopped?: boolean };

/** Run one agent/http node with its retry budget. Does not apply `on_fail`. */
async function runPhaseAttempts(
  flow: FlowDefinition,
  phase: FlowPhaseDef,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  options: OrchestratorOptions,
  shouldStop: () => boolean = () => false,
): Promise<AttemptResult> {
  const kind = phaseKind(phase);
  const maxAttempts = 1 + phaseRetryLimit(phase);
  let attempt = 0;
  let lastError = "failed";

  while (attempt < maxAttempts && !ctx.cancelled && !shouldStop()) {
    attempt += 1;
    const runPhase = phaseRunState(ctx, phase.id);
    if (runPhase) {
      runPhase.status = "running";
      runPhase.startedAt = runPhase.startedAt ?? new Date().toISOString();
      runPhase.attempts = attempt;
      runPhase.message = attempt > 1 ? `Retry ${attempt}/${maxAttempts}` : null;
    }
    // A parallel gate may be waiting for approval — keep that status visible.
    if (!ctx.state.pendingGatePhaseId) ctx.state.status = "running";
    ctx.state.currentPhaseId = phase.id;
    appendEvent(ctx, { type: "phase.started", phaseId: phase.id, attempt });
    writeState(ctx, hooks);

    const outPath = phaseOutputPath(ctx.runDir, phase.id);
    // Clear previous attempt output so success requires a fresh write.
    try {
      if (existsSync(outPath)) writeFileSync(outPath, "", "utf8");
    } catch {
      /* ignore */
    }

    const result =
      kind === "http"
        ? await runHttpPhase(flow, phase, ctx, hooks, outPath)
        : await runAgentPhaseOnce(flow, phase, ctx, hooks, outPath, options.globalToolLaunchArgs);

    if (ctx.cancelled) return { ok: false, error: "Cancelled", stopped: true };

    if (result.ok) {
      const done = phaseRunState(ctx, phase.id);
      if (done) {
        done.status = "done";
        done.completedAt = new Date().toISOString();
        done.outputPath = outPath;
        done.message = attempt > 1 ? `Done after ${attempt} attempts` : null;
      }
      recomputeRunProgress(ctx.state);
      appendEvent(ctx, { type: "phase.done", phaseId: phase.id, attempt });
      writeState(ctx, hooks);
      return { ok: true };
    }

    lastError = result.error ?? "Phase failed";
    appendEvent(ctx, {
      type: "phase.attempt_failed",
      phaseId: phase.id,
      attempt,
      error: lastError,
    });
    writeState(ctx, hooks);
  }

  if (ctx.cancelled || shouldStop()) return { ok: false, error: lastError, stopped: true };
  return { ok: false, error: lastError };
}

function markGateApproved(
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  phase: FlowPhaseDef,
): void {
  const runPhase = phaseRunState(ctx, phase.id);
  if (runPhase) {
    runPhase.status = "done";
    runPhase.completedAt = new Date().toISOString();
    runPhase.message = "Approved";
  }
  if (ctx.state.status !== "failed") ctx.state.status = "running";
  recomputeRunProgress(ctx.state);
  appendEvent(ctx, { type: "gate.approved", phaseId: phase.id });
  writeState(ctx, hooks);
}

/** Legacy linear walk: list order, `next`, and `on_fail` / `on_reject` jumps. */
async function runSequentialPhases(
  flow: FlowDefinition,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  options: OrchestratorOptions,
): Promise<void> {
  let currentId: string | null = flow.phases[0]?.id ?? null;
  // Save-time validation rejects branch loops; this is a runtime backstop.
  const maxSteps = Math.max(1, flow.phases.length) * 3;
  let steps = 0;

  while (currentId && !ctx.cancelled) {
    steps += 1;
    if (steps > maxSteps) {
      ctx.state.status = "failed";
      ctx.state.error = `Phase loop detected (more than ${maxSteps} steps)`;
      writeState(ctx, hooks);
      break;
    }

    const phase = flow.phases.find((p) => p.id === currentId);
    if (!phase) {
      ctx.state.status = "failed";
      ctx.state.error = `Unknown phase: ${currentId}`;
      writeState(ctx, hooks);
      break;
    }

    const kind = phaseKind(phase);
    const needsGate = kind === "gate" || phase.requireApproval === true;

    if (needsGate) {
      if (ctx.cancelled) break;
      const decision = await waitForGate(ctx, hooks, phase);
      if (ctx.cancelled) break;

      ctx.state.pendingGatePhaseId = null;
      if (decision === "reject") {
        const branch = resolvePhaseBranch(phase.onReject, "fail");
        const next = applyPhaseBranch(flow, ctx, hooks, phase, branch, "Rejected by user");
        if (next === "failed") break;
        currentId = next;
        if (ctx.state.status === "waiting_approval") {
          ctx.state.status = "running";
        }
        continue;
      }

      // Approved gate with kind===gate and no agent work: mark done and continue.
      if (kind === "gate") {
        markGateApproved(ctx, hooks, phase);
        currentId = nextPhaseIdAfterSuccess(flow.phases, phase.id);
        continue;
      }

      ctx.state.status = "running";
      appendEvent(ctx, { type: "gate.approved", phaseId: phase.id });
      writeState(ctx, hooks);
    }

    const result = await runPhaseAttempts(flow, phase, ctx, hooks, options);
    if (ctx.cancelled) break;

    if (!result.ok) {
      const branch = resolvePhaseBranch(phase.onFail, "fail");
      const next = applyPhaseBranch(flow, ctx, hooks, phase, branch, result.error);
      if (next === "failed") break;
      currentId = next;
      continue;
    }

    currentId = nextPhaseIdAfterSuccess(flow.phases, phase.id);
  }
}

/** In DAG mode only `fail` / `skip` branches apply (jumps are rejected at save time). */
function dagBranch(branch: FlowPhaseBranch | undefined): "fail" | "skip" {
  return resolvePhaseBranch(branch, "fail") === "skip" ? "skip" : "fail";
}

function markPhaseStopped(
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  phaseId: string,
): void {
  const runPhase = phaseRunState(ctx, phaseId);
  if (runPhase && runPhase.status !== "done" && runPhase.status !== "failed") {
    runPhase.status = "skipped";
    runPhase.completedAt = new Date().toISOString();
    runPhase.message = "Stopped: another phase failed";
  }
  recomputeRunProgress(ctx.state);
  appendEvent(ctx, { type: "phase.skipped", phaseId, message: "stopped" });
  writeState(ctx, hooks);
}

/**
 * DAG walk (`depends_on`): every phase whose dependencies are done/skipped starts,
 * up to `max_parallel` at once. A failing phase (after retries, `on_fail: fail`) stops
 * the run: running siblings are killed and pending phases are skipped.
 */
async function runDagPhases(
  flow: FlowDefinition,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  options: OrchestratorOptions,
): Promise<Map<string, FlowPhaseStatus>> {
  // Scheduler-owned statuses: the state-file watcher may overwrite ctx.state.phases
  // with a stale disk copy, so readiness is never derived from it.
  const nodeStatus = new Map<string, FlowPhaseStatus>(
    flow.phases.map((p) => [p.id, "pending" as FlowPhaseStatus]),
  );
  const running = new Map<string, Promise<void>>();
  const maxParallel = Math.max(1, flow.maxParallel ?? FLOW_DEFAULT_MAX_PARALLEL);
  let stopping = false;
  const shouldStop = () => stopping;
  // Gates resolve through a single per-flow waiter, so approvals are serialized.
  let gateChain: Promise<unknown> = Promise.resolve();

  const stopRun = () => {
    if (stopping) return;
    stopping = true;
    for (const child of ctx.children ?? []) hooks.killChild(child);
    if (ctx.state.pendingGatePhaseId) cancelFlowGateWait(ctx.flowId);
  };

  const runNode = async (phase: FlowPhaseDef): Promise<FlowPhaseStatus> => {
    const kind = phaseKind(phase);
    if (kind === "gate" || phase.requireApproval === true) {
      const wait = gateChain.then(() =>
        shouldStop() || ctx.cancelled ? ("reject" as const) : waitForGate(ctx, hooks, phase),
      );
      gateChain = wait.catch(() => undefined);
      const decision = await wait;
      if (ctx.cancelled) return "skipped";
      ctx.state.pendingGatePhaseId = null;
      if (shouldStop()) {
        markPhaseStopped(ctx, hooks, phase.id);
        return "skipped";
      }
      if (ctx.state.status === "waiting_approval") ctx.state.status = "running";
      if (decision === "reject") {
        const branch = dagBranch(phase.onReject);
        const res = applyPhaseBranch(flow, ctx, hooks, phase, branch, "Rejected by user");
        return res === "failed" ? "failed" : "skipped";
      }
      if (kind === "gate") {
        markGateApproved(ctx, hooks, phase);
        return "done";
      }
      appendEvent(ctx, { type: "gate.approved", phaseId: phase.id });
      writeState(ctx, hooks);
    }

    const result = await runPhaseAttempts(flow, phase, ctx, hooks, options, shouldStop);
    if (result.ok) return "done";
    if (ctx.cancelled) return "skipped";
    if (result.stopped) {
      markPhaseStopped(ctx, hooks, phase.id);
      return "skipped";
    }
    const res = applyPhaseBranch(flow, ctx, hooks, phase, dagBranch(phase.onFail), result.error);
    return res === "failed" ? "failed" : "skipped";
  };

  while (!ctx.cancelled && !stopping) {
    const ready = readyDagPhaseIds(flow.phases, nodeStatus);
    for (const id of ready) {
      if (running.size >= maxParallel) break;
      const phase = flow.phases.find((p) => p.id === id)!;
      nodeStatus.set(id, "running");
      const task = runNode(phase)
        .catch((err: unknown) => {
          ctx.state.status = "failed";
          ctx.state.error = err instanceof Error ? err.message : String(err);
          return "failed" as FlowPhaseStatus;
        })
        .then((status) => {
          nodeStatus.set(id, status);
          if (status === "failed") stopRun();
        })
        .finally(() => {
          running.delete(id);
        });
      running.set(id, task);
    }

    if (running.size === 0) {
      const unresolved = flow.phases.filter((p) => {
        const st = nodeStatus.get(p.id);
        return st !== "done" && st !== "skipped";
      });
      if (unresolved.length > 0 && ctx.state.status !== "failed") {
        ctx.state.status = "failed";
        ctx.state.error = `Unsatisfiable dependencies: ${unresolved.map((p) => p.id).join(", ")}`;
        writeState(ctx, hooks);
      }
      break;
    }

    await Promise.race(running.values());
  }

  if (stopping || ctx.cancelled) {
    stopRun();
    await Promise.allSettled(running.values());
    if (!ctx.cancelled) {
      for (const phase of flow.phases) {
        if (nodeStatus.get(phase.id) === "pending") {
          nodeStatus.set(phase.id, "skipped");
          const runPhase = phaseRunState(ctx, phase.id);
          if (runPhase && runPhase.status === "pending") runPhase.status = "skipped";
        }
      }
    }
  }

  // Re-apply authoritative statuses in case the watcher replaced the phase array.
  for (const phase of flow.phases) {
    const st = nodeStatus.get(phase.id);
    const runPhase = phaseRunState(ctx, phase.id);
    if (runPhase && st && st !== "running" && runPhase.status !== st && !ctx.cancelled) {
      runPhase.status = st;
    }
  }
  recomputeRunProgress(ctx.state);
  return nodeStatus;
}

/**
 * Multi-node orchestrator: per-phase spawn, I/O piping, approval gates, retry & branch,
 * and parallel DAG scheduling when phases declare `depends_on`.
 */
export async function executeOrchestratedFlowRun(
  flow: FlowDefinition,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  options: OrchestratorOptions = {},
): Promise<void> {
  ctx.state.orchestration = true;
  ctx.state.pendingGatePhaseId = null;
  ctx.children ??= new Set();
  writeState(ctx, hooks);

  ctx.stopWatching = hooks.watchStateFile(ctx.runId, ctx.state);

  const dag = flowUsesDagScheduling(flow.phases);

  try {
    let dagStatus: Map<string, FlowPhaseStatus> | null = null;
    if (dag) {
      appendEvent(ctx, {
        type: "run.dag",
        maxParallel: flow.maxParallel ?? FLOW_DEFAULT_MAX_PARALLEL,
      });
      dagStatus = await runDagPhases(flow, ctx, hooks, options);
    } else {
      await runSequentialPhases(flow, ctx, hooks, options);
    }

    if (ctx.cancelled) {
      // cancelFlowRun already updated state
      return;
    }

    if (ctx.state.status === "failed") {
      appendEvent(ctx, { type: "run.failed", error: ctx.state.error });
      writeState(ctx, hooks);
      return;
    }

    // Concatenate phase outputs into final run output.
    const finalParts: string[] = [];
    for (const phase of flow.phases) {
      const rp = phaseRunState(ctx, phase.id);
      const status = dagStatus?.get(phase.id) ?? rp?.status;
      if (!rp || status !== "done") continue;
      const content =
        rp.outputPath && existsSync(rp.outputPath)
          ? readFileSync(rp.outputPath, "utf8").trim()
          : readPhaseOutput(ctx.runDir, phase.id).trim();
      if (content) {
        finalParts.push(`## 【${phase.id}】${phase.label}\n\n${content}`);
      }
    }

    const assembled = finalParts.join("\n\n---\n\n") || "# Flow completed\n";
    const outputPath = join(ctx.runDir, "output.md");
    writeFileSync(outputPath, `${assembled}\n`, "utf8");
    ctx.state.outputPath = outputPath;

    ctx.state.status = "completed";
    ctx.state.currentPhaseId = null;
    ctx.state.pendingGatePhaseId = null;
    recomputeRunProgress(ctx.state);
    appendEvent(ctx, { type: "run.completed", outputPath });
    writeState(ctx, hooks);
  } finally {
    ctx.stopWatching?.();
    releaseMcp(ctx);
  }
}

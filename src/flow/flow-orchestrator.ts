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
import { FLOW_OUTPUT_BEGIN, FLOW_PROGRESS_PREFIX } from "../shared/flow-protocol.js";
import type {
  FlowDefinition,
  FlowPhaseBranch,
  FlowPhaseDef,
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
  for (const phase of flow.phases) {
    if (phase.id === beforePhaseId) break;
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

  const runPhase = ctx.state.phases.find((p) => p.id === phase.id);
  if (runPhase) {
    runPhase.tool = resolved.tool;
    runPhase.outputPath = outputPath;
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

  const prep = prepareFlowAgentSpawn(resolved.tool, ctx.runId, outputPath, resolved.cwd, {
    extraMcpServers: flow.extraMcpServers,
    agentAllowedTools: flow.agentAllowedTools,
  });
  ctx.mcpCleanup = prep.mcpMount.cleanup;

  const env = {
    ...process.env,
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

    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      if (ctx.timeout) {
        clearTimeout(ctx.timeout);
        ctx.timeout = undefined;
      }
      releaseMcp(ctx);
      ctx.child = undefined;
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
      releaseMcp(ctx);
      finish({ ok: false, error: message });
      return;
    }
    ctx.child = child;

    hooks.emitConsole?.({
      phaseId: phase.id,
      stream: "stdout",
      data: `\n── ${phase.id}${phase.label ? ` · ${phase.label}` : ""} ──\n`,
    });

    ctx.timeout = setTimeout(() => {
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

/**
 * Multi-node orchestrator: per-phase spawn, I/O piping, approval gates, retry & branch.
 */
export async function executeOrchestratedFlowRun(
  flow: FlowDefinition,
  ctx: OrchestratorRunContext,
  hooks: OrchestratorHooks,
  options: { globalToolLaunchArgs?: ToolLaunchArgs } = {},
): Promise<void> {
  ctx.state.orchestration = true;
  ctx.state.pendingGatePhaseId = null;
  writeState(ctx, hooks);

  ctx.stopWatching = hooks.watchStateFile(ctx.runId, ctx.state);

  let currentId: string | null = flow.phases[0]?.id ?? null;
  const visited = new Set<string>();

  try {
    while (currentId && !ctx.cancelled) {
      if (visited.has(currentId) && visited.size > flow.phases.length * 3) {
        ctx.state.status = "failed";
        ctx.state.error = "Phase loop detected";
        writeState(ctx, hooks);
        break;
      }
      visited.add(currentId);

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
          const next = applyPhaseBranch(
            flow,
            ctx,
            hooks,
            phase,
            branch,
            "Rejected by user",
          );
          if (next === "failed") break;
          currentId = next;
          if (ctx.state.status === "waiting_approval") {
            ctx.state.status = "running";
          }
          continue;
        }

        // Approved gate with kind===gate and no agent work: mark done and continue.
        if (kind === "gate") {
          const runPhase = ctx.state.phases.find((p) => p.id === phase.id);
          if (runPhase) {
            runPhase.status = "done";
            runPhase.completedAt = new Date().toISOString();
            runPhase.message = "Approved";
          }
          ctx.state.status = "running";
          recomputeRunProgress(ctx.state);
          appendEvent(ctx, { type: "gate.approved", phaseId: phase.id });
          writeState(ctx, hooks);
          currentId = nextPhaseIdAfterSuccess(flow.phases, phase.id);
          continue;
        }

        ctx.state.status = "running";
        appendEvent(ctx, { type: "gate.approved", phaseId: phase.id });
        writeState(ctx, hooks);
      }

      const runPhase = ctx.state.phases.find((p) => p.id === phase.id);
      const maxAttempts = 1 + phaseRetryLimit(phase);
      let attempt = 0;
      let lastError = "failed";
      let succeeded = false;

      while (attempt < maxAttempts && !ctx.cancelled) {
        attempt += 1;
        if (runPhase) {
          runPhase.status = "running";
          runPhase.startedAt = runPhase.startedAt ?? new Date().toISOString();
          runPhase.attempts = attempt;
          runPhase.message = attempt > 1 ? `Retry ${attempt}/${maxAttempts}` : null;
        }
        ctx.state.status = "running";
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
            : await runAgentPhaseOnce(
                flow,
                phase,
                ctx,
                hooks,
                outPath,
                options.globalToolLaunchArgs,
              );

        if (ctx.cancelled) break;

        if (result.ok) {
          if (runPhase) {
            runPhase.status = "done";
            runPhase.completedAt = new Date().toISOString();
            runPhase.outputPath = outPath;
            runPhase.message = attempt > 1 ? `Done after ${attempt} attempts` : null;
          }
          recomputeRunProgress(ctx.state);
          appendEvent(ctx, { type: "phase.done", phaseId: phase.id, attempt });
          writeState(ctx, hooks);
          succeeded = true;
          break;
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

      if (ctx.cancelled) break;

      if (!succeeded) {
        const branch = resolvePhaseBranch(phase.onFail, "fail");
        const next = applyPhaseBranch(flow, ctx, hooks, phase, branch, lastError);
        if (next === "failed") break;
        currentId = next;
        continue;
      }

      currentId = nextPhaseIdAfterSuccess(flow.phases, phase.id);
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
      const rp = ctx.state.phases.find((p) => p.id === phase.id);
      if (!rp || rp.status !== "done") continue;
      const content = rp.outputPath && existsSync(rp.outputPath)
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

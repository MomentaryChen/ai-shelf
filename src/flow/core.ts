import { type ChildProcess, execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import { cronNextRun, shouldRunFlowNow, validateFlowCronMinInterval } from "../shared/flow-cron.js";
import { parseFlowDocument } from "../shared/flow-parse.js";
import { FLOW_OUTPUT_BEGIN, FLOW_PROGRESS_PREFIX } from "../shared/flow-protocol.js";
import {
  claimFlowScheduleSlot,
  readFlowLastSlot,
  readFlowSchedulePrefs,
  writeFlowLastSlot,
} from "../shared/flow-schedule-pref.js";
import {
  FLOW_RUN_STATE_SCHEMA,
  type FlowDefinition,
  type FlowListItem,
  type FlowProgressEvent,
  type FlowRunState,
} from "../shared/flow-types.js";
import type { FlowRunArtifact, FlowRunEvent } from "../shared/flow-run-types.js";
import type { ToolLaunchArgs } from "../tool-launch.js";
import { notifyFlowRunFailed, notifyFlowRunCompleted } from "./flow-notify.js";
import { patchFlowScheduleInContent, patchFlowRunnerInContent, ensureFlowDefaultsInContent } from "../shared/flow-frontmatter-patch.js";
import {
  getFlowDagNodeCommandDetail,
  type FlowDagNodeCommandDetail,
  type FlowDagNodeKind,
} from "./flow-command-preview.js";
import { prepareFlowAgentSpawn } from "./mcp-config.js";
import { resolveFlowRunner } from "./flow-runner-resolve.js";
import { buildFallbackOutputMarkdown, writeRunOutputIfMissing } from "./flow-output.js";
import { buildFlowRunPrompt } from "./flow-system-skills.js";
import { spawnAgentPrint } from "./claude-spawn.js";
import {
  deleteFlowChatData,
  deleteRunsForFlow,
  FLOW_CHAT_DRAFT_ID,
  migrateFlowChat,
  readFlowChat,
  saveFlowChat,
  listFlowPromptLogs,
} from "./flow-chat-store.js";
import {
  applyProgressEventToState,
  appendRunEvent,
  readRunState,
  recomputeRunProgress,
  runsDir as flowRunsDir,
  writeRunState,
} from "./run-state-store.js";

type RunStateListener = (state: FlowRunState) => void;

const activeRuns = new Map<string, FlowRunState>();
const runListeners = new Set<RunStateListener>();
const runsInFlight = new Set<string>();

type ActiveRunContext = {
  flowId: string;
  runId: string;
  runDir: string;
  state: FlowRunState;
  child?: ChildProcess;
  abortHttp?: AbortController;
  timeout?: NodeJS.Timeout;
  stopWatching?: () => void;
  mcpCleanup?: () => void;
  cancelled: boolean;
};

const activeRunContexts = new Map<string, ActiveRunContext>();

function killRunChild(child: ChildProcess): void {
  if (!child.pid) {
    try {
      child.kill();
    } catch {
      /* already dead */
    }
    return;
  }
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    /* already dead */
  }
}

function flowsDir(): string {
  return join(getAppDataDir(), "flows");
}

function runsDir(): string {
  return flowRunsDir();
}

function initFlowDirs(): void {
  mkdirSync(flowsDir(), { recursive: true });
  mkdirSync(runsDir(), { recursive: true });
}

function expandPathTemplate(template: string, flowId: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return template
    .replace(/\{date\}/g, date)
    .replace(/\{id\}/g, flowId)
    .replace(/\{time\}/g, time)
    .replace(/^~(?=\/|\\)/, homedir());
}

function broadcastState(state: FlowRunState): void {
  activeRuns.set(state.runId, state);
  for (const listener of runListeners) listener(state);
}

function writeState(runDir: string, state: FlowRunState): void {
  writeRunState(runDir, state);
  broadcastState(state);
}

function appendEvent(runDir: string, event: Record<string, unknown>): void {
  appendRunEvent(runDir, event);
}

function initialRunState(flow: FlowDefinition, runId: string, runDir: string): FlowRunState {
  const phases = flow.phases.map((p) => ({
    id: p.id,
    label: p.label,
    status: "pending" as const,
    startedAt: null,
    completedAt: null,
    message: null,
  }));
  return {
    schema: FLOW_RUN_STATE_SCHEMA,
    runId,
    flowId: flow.id,
    status: "pending",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentPhaseId: null,
    progress: { completed: 0, total: phases.length, percent: phases.length ? 0 : 100 },
    phases,
    outputPath: null,
    error: null,
    logPath: join(runDir, "events.jsonl"),
  };
}

function applyProgressEvent(state: FlowRunState, event: FlowProgressEvent): void {
  applyProgressEventToState(state, event);
}

function parseProgressLine(line: string): FlowProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(FLOW_PROGRESS_PREFIX)) return null;
  const jsonPart = trimmed.slice(FLOW_PROGRESS_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as FlowProgressEvent;
    if (parsed && typeof parsed.type === "string") return parsed;
  } catch {
    /* ignore malformed progress */
  }
  return null;
}

function releaseRunMcp(ctx: ActiveRunContext): void {
  if (!ctx.mcpCleanup) return;
  const cleanup = ctx.mcpCleanup;
  ctx.mcpCleanup = undefined;
  cleanup();
}

function spawnAgentPrompt(
  prompt: string,
  flow: FlowDefinition,
  runId: string,
  outputPath: string,
  runOptions: RunFlowOptions,
): { child: ChildProcess; mcpCleanup: () => void } {
  const resolved = resolveFlowRunner(flow, {
    globalToolLaunchArgs: runOptions.globalToolLaunchArgs,
  });
  if ("error" in resolved) {
    throw new Error(resolved.error);
  }

  const prep = prepareFlowAgentSpawn(resolved.tool, runId, outputPath, resolved.cwd, {
    extraMcpServers: flow.extraMcpServers,
    agentAllowedTools: flow.agentAllowedTools,
  });
  const env = {
    ...process.env,
    AISHELF_RUN_ID: runId,
    AISHELF_APP_DATA_DIR: getAppDataDir(),
    AISHELF_FLOW_OUTPUT_PATH: outputPath,
  };

  try {
    const child = spawnAgentPrint({
      launchCommand: resolved.launchCommand,
      cwd: resolved.cwd,
      prompt,
      env,
      printPrefix: prep.printPrefix,
      args: prep.extraArgs,
      promptLog: { flowId: flow.id, kind: "run", runId },
    });
    return { child, mcpCleanup: prep.mcpMount.cleanup };
  } catch (err) {
    prep.mcpMount.cleanup();
    throw err;
  }
}

function watchRunStateFile(runId: string, state: FlowRunState): () => void {
  const statePath = join(runsDir(), runId, "state.json");
  let lastUpdated = state.updatedAt;

  watchFile(statePath, { interval: 500 }, () => {
    const disk = readRunState(runId);
    if (!disk || disk.updatedAt === lastUpdated) return;
    lastUpdated = disk.updatedAt;
    Object.assign(state, disk);
    broadcastState(state);
  });

  return () => unwatchFile(statePath);
}

export function initFlowCore(): void {
  initFlowDirs();
}

export function onFlowRunState(listener: RunStateListener): () => void {
  runListeners.add(listener);
  return () => runListeners.delete(listener);
}

export function listFlows(): FlowListItem[] {
  initFlowDirs();
  const files = readdirSync(flowsDir()).filter((f) => f.endsWith(".flow.md"));
  const items: FlowListItem[] = [];

  for (const fileName of files.sort()) {
    const filePath = join(flowsDir(), fileName);
    const content = readFileSync(filePath, "utf8");
    const parsed = parseFlowDocument(content, fileName, filePath);
    if ("error" in parsed) continue;
    const tz = parsed.timezone ?? "Asia/Taipei";
    items.push({
      id: parsed.id,
      fileName,
      enabled: parsed.enabled,
      schedule: parsed.schedule,
      phaseCount: parsed.phases.length,
      nextRunAt: parsed.schedule ? cronNextRun(parsed.schedule, tz) : null,
    });
  }
  return items;
}

export function getFlowDefinition(flowId: string): FlowDefinition | null {
  initFlowDirs();
  const files = readdirSync(flowsDir()).filter((f) => f.endsWith(".flow.md"));
  for (const fileName of files) {
    const filePath = join(flowsDir(), fileName);
    const content = readFileSync(filePath, "utf8");
    const parsed = parseFlowDocument(content, fileName, filePath);
    if ("error" in parsed) continue;
    if (parsed.id === flowId) return parsed;
  }
  return null;
}

export function getFlowRunState(runId: string): FlowRunState | null {
  const cached = activeRuns.get(runId);
  if (cached) return cached;
  const statePath = join(runsDir(), runId, "state.json");
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as FlowRunState;
  } catch {
    return null;
  }
}

export function getFlowsDir(): string {
  initFlowDirs();
  return flowsDir();
}

export function isFlowRunning(flowId: string): boolean {
  return runsInFlight.has(flowId);
}

export function listActiveFlowRuns(): FlowRunState[] {
  const states: FlowRunState[] = [];
  for (const flowId of runsInFlight) {
    const ctx = activeRunContexts.get(flowId);
    if (ctx) {
      states.push(ctx.state);
      continue;
    }
    for (const state of activeRuns.values()) {
      if (state.flowId === flowId && (state.status === "running" || state.status === "pending")) {
        states.push(state);
        break;
      }
    }
  }
  return states;
}

export function cancelFlowRun(flowId: string): { ok: boolean; runId?: string; error?: string } {
  const ctx = activeRunContexts.get(flowId);
  if (!ctx) {
    return { ok: false, error: "No run in progress for this flow" };
  }
  if (ctx.cancelled) {
    return { ok: true, runId: ctx.runId };
  }

  ctx.cancelled = true;
  if (ctx.timeout) clearTimeout(ctx.timeout);
  ctx.abortHttp?.abort();
  if (ctx.child) killRunChild(ctx.child);

  for (const phase of ctx.state.phases) {
    if (phase.status === "running") {
      phase.status = "skipped";
      phase.completedAt = new Date().toISOString();
      phase.message = "Cancelled";
    } else if (phase.status === "pending") {
      phase.status = "skipped";
    }
  }
  ctx.state.status = "cancelled";
  ctx.state.error = "Cancelled by user";
  ctx.state.currentPhaseId = null;
  recomputeRunProgress(ctx.state);
  appendEvent(ctx.runDir, { type: "run.cancelled" });
  writeState(ctx.runDir, ctx.state);

  return { ok: true, runId: ctx.runId };
}

export type RunFlowOptions = {
  wait?: boolean;
  trigger?: "manual" | "schedule";
  /** App-wide per-tool launch args (from settings), merged before flow `tool_args`. */
  globalToolLaunchArgs?: ToolLaunchArgs;
};

export async function runFlow(
  flowId: string,
  options: RunFlowOptions = {},
): Promise<{ ok: boolean; runId?: string; error?: string; state?: FlowRunState }> {
  initFlowDirs();
  if (runsInFlight.has(flowId)) {
    return { ok: false, error: "A run is already in progress for this flow" };
  }

  const flow = getFlowDefinition(flowId);
  if (!flow) return { ok: false, error: `Flow not found: ${flowId}` };
  if (!flow.enabled) return { ok: false, error: "Flow is disabled" };

  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Random segment keeps run dirs unique when two processes start the same flow
  // in the same second (e.g. a manual run racing a scheduled one).
  const uniq = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  const runId = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}-${uniq}-${flow.id}`;
  const runDir = join(runsDir(), runId);
  mkdirSync(runDir, { recursive: true });

  const state = initialRunState(flow, runId, runDir);
  state.status = "running";
  writeState(runDir, state);
  appendEvent(runDir, { type: "run.started", flowId, trigger: options.trigger ?? "manual" });

  runsInFlight.add(flowId);

  const runPromise = executeFlowRun(flow, runDir, state, options).finally(() => {
    runsInFlight.delete(flowId);
    activeRunContexts.delete(flowId);
    const done = getFlowRunState(runId) ?? state;
    if (done.status === "failed") {
      void notifyFlowRunFailed(flow, done);
    } else if (done.status === "completed") {
      void notifyFlowRunCompleted(flow, done);
    }
  });

  if (options.wait) {
    await runPromise;
    const done = getFlowRunState(runId) ?? state;
    return {
      ok: done.status === "completed",
      runId,
      state: done,
      error: done.status === "failed" ? (done.error ?? "run failed") : undefined,
    };
  }

  void runPromise;
  return { ok: true, runId };
}

export type RunDueFlowsResult = {
  checked: number;
  started: string[];
  skipped: string[];
  errors: { flowId: string; error: string }[];
};

export type RunDueFlowsOptions = {
  /**
   * Await each scheduled run to completion (default). The app scheduler passes
   * false: a long run must not block this loop, or every other flow's fire
   * minute is silently missed while it waits (cron has no catch-up).
   */
  wait?: boolean;
};

export async function runDueFlows(
  now = new Date(),
  options: RunDueFlowsOptions = {},
): Promise<RunDueFlowsResult> {
  const wait = options.wait ?? true;
  const result: RunDueFlowsResult = { checked: 0, started: [], skipped: [], errors: [] };
  if (!readFlowSchedulePrefs().schedulerEnabled) {
    return result;
  }

  initFlowDirs();
  const files = readdirSync(flowsDir()).filter((f) => f.endsWith(".flow.md"));

  for (const fileName of files.sort()) {
    const filePath = join(flowsDir(), fileName);
    const content = readFileSync(filePath, "utf8");
    const parsed = parseFlowDocument(content, fileName, filePath);
    if ("error" in parsed || !parsed.schedule || !parsed.enabled) continue;

    const tz = parsed.timezone ?? "Asia/Taipei";
    const intervalError = validateFlowCronMinInterval(parsed.schedule, tz);
    if (intervalError) {
      result.errors.push({ flowId: parsed.id, error: intervalError });
      continue;
    }

    result.checked += 1;
    const lastSlot = readFlowLastSlot(parsed.id);
    const { due, slotKey } = shouldRunFlowNow(parsed.schedule, tz, lastSlot, now);
    if (!due || !slotKey) {
      result.skipped.push(parsed.id);
      continue;
    }
    if (runsInFlight.has(parsed.id)) {
      result.skipped.push(parsed.id);
      continue;
    }
    // Claim the slot across processes (in-app scheduler vs headless `cli.js due`)
    // and record it before the run starts, so the same cron fire never starts twice.
    if (!claimFlowScheduleSlot(parsed.id, slotKey)) {
      result.skipped.push(parsed.id);
      continue;
    }
    writeFlowLastSlot(parsed.id, slotKey);

    const run = await runFlow(parsed.id, {
      wait,
      trigger: "schedule",
    });
    if (run.ok) {
      result.started.push(parsed.id);
    } else {
      result.errors.push({ flowId: parsed.id, error: run.error ?? "run failed" });
    }
  }

  return result;
}

async function executeHttpFlow(
  flow: FlowDefinition,
  runDir: string,
  state: FlowRunState,
  outputPath: string,
  ctx: ActiveRunContext,
): Promise<void> {
  const url = flow.httpUrl;
  if (!url) {
    state.status = "failed";
    state.error = "HTTP runner requires frontmatter url";
    ensureRunOutput(flow, state, outputPath, runDir, {
      status: "failed",
      error: state.error,
    });
    appendEvent(runDir, { type: "run.failed", error: state.error });
    writeState(runDir, state);
    return;
  }

  const phase = state.phases[0];
  if (phase) {
    phase.status = "running";
    phase.startedAt = new Date().toISOString();
    state.currentPhaseId = phase.id;
    appendEvent(runDir, { type: "phase.started", phaseId: phase.id });
    writeState(runDir, state);
  }

  const abortHttp = new AbortController();
  ctx.abortHttp = abortHttp;

  try {
    const res = await fetch(url, {
      method: flow.httpMethod,
      signal: AbortSignal.any([abortHttp.signal, AbortSignal.timeout(flow.timeoutSec * 1000)]),
    });
    const body = [
      "# Connectivity check",
      "",
      `- URL: ${url}`,
      `- Method: ${flow.httpMethod}`,
      `- Status: ${res.status} ${res.statusText}`,
      `- OK: ${res.ok}`,
    ].join("\n");
    writeFileSync(outputPath, `${body}\n`, "utf8");
    state.outputPath = outputPath;

    const message = `${res.status} ${res.statusText}`;
    if (phase) {
      phase.status = res.ok ? "done" : "failed";
      phase.completedAt = new Date().toISOString();
      phase.message = message;
      appendEvent(runDir, {
        type: res.ok ? "phase.done" : "phase.failed",
        phaseId: phase.id,
        message,
      });
    }
    for (const p of state.phases) {
      if (p.status === "pending" || p.status === "running") {
        p.status = res.ok ? "done" : "failed";
        p.completedAt = new Date().toISOString();
      }
    }
    recomputeRunProgress(state);
    state.status = res.ok ? "completed" : "failed";
    state.error = res.ok ? null : `HTTP ${res.status}`;
    state.currentPhaseId = null;
    appendEvent(runDir, {
      type: res.ok ? "run.completed" : "run.failed",
      outputPath: state.outputPath,
      error: state.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (ctx.cancelled || abortHttp.signal.aborted) {
      return;
    }
    if (phase) {
      phase.status = "failed";
      phase.completedAt = new Date().toISOString();
      phase.message = message;
    }
    state.status = "failed";
    state.error = message;
    ensureRunOutput(flow, state, outputPath, runDir, { status: "failed", error: message });
    appendEvent(runDir, { type: "run.failed", error: message });
  }

  if (ctx.cancelled) return;
  if (state.status === "failed") {
    ensureRunOutput(flow, state, outputPath, runDir, { status: "failed", error: state.error });
  }
  ensureOutputPathOnState(state, runDir);
  writeState(runDir, state);
}

async function executeFlowRun(
  flow: FlowDefinition,
  runDir: string,
  state: FlowRunState,
  runOptions: RunFlowOptions = {},
): Promise<void> {
  const outputPath = flow.outputTemplate
    ? expandPathTemplate(flow.outputTemplate, flow.id)
    : join(runDir, "output.md");

  mkdirSync(dirname(outputPath), { recursive: true });

  const ctx: ActiveRunContext = {
    flowId: flow.id,
    runId: state.runId,
    runDir,
    state,
    cancelled: false,
  };
  activeRunContexts.set(flow.id, ctx);

  if (flow.runner === "http") {
    await executeHttpFlow(flow, runDir, state, outputPath, ctx);
    return;
  }

  const prompt = buildFlowRunPrompt(flow.body, flow.phases.map((p) => p.id));

  writeFileSync(join(runDir, "prompt.md"), prompt, "utf8");

  await new Promise<void>((resolve) => {
    let outputMode = false;
    const outputChunks: string[] = [];
    let stderr = "";
    let stdoutBuf = "";
    let runSettled = false;
    const stopWatching = watchRunStateFile(state.runId, state);
    ctx.stopWatching = stopWatching;

    const finish = () => {
      releaseRunMcp(ctx);
      ctx.stopWatching?.();
      resolve();
    };

    const handleLine = (line: string) => {
      if (ctx.cancelled || runSettled) return;
      if (!outputMode) {
        if (line.trim() === FLOW_OUTPUT_BEGIN) {
          outputMode = true;
          return;
        }
        const progress = parseProgressLine(line);
        if (progress) {
          applyProgressEvent(state, progress);
          appendEvent(runDir, {
            type: progress.type,
            phaseId: progress.phaseId,
            message: progress.message,
          });
          writeState(runDir, state);
          return;
        }
      }
      if (outputMode) {
        outputChunks.push(line);
      }
    };

    let child: ChildProcess;
    try {
      const spawned = spawnAgentPrompt(prompt, flow, state.runId, outputPath, runOptions);
      child = spawned.child;
      ctx.mcpCleanup = spawned.mcpCleanup;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      state.status = "failed";
      state.error = message;
      ensureRunOutput(flow, state, outputPath, runDir, { status: "failed", error: message });
      appendEvent(runDir, { type: "run.failed", error: message });
      writeState(runDir, state);
      finish();
      return;
    }
    ctx.child = child;

    const timeout = setTimeout(() => {
      if (ctx.cancelled || runSettled) return;
      runSettled = true;
      killRunChild(child);
      state.status = "failed";
      state.error = `Timed out after ${flow.timeoutSec}s`;
      ensureRunOutput(flow, state, outputPath, runDir, {
        status: "failed",
        error: state.error,
        stderr,
        partialStdout: outputChunks.join("\n").trim() || stdoutBuf.trim(),
      });
      appendEvent(runDir, { type: "run.failed", error: state.error });
      writeState(runDir, state);
      finish();
    }, flow.timeoutSec * 1000);
    ctx.timeout = timeout;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf8");
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (stdoutBuf) handleLine(stdoutBuf);

      if (ctx.cancelled) {
        finish();
        return;
      }
      if (runSettled) {
        finish();
        return;
      }
      runSettled = true;

      const diskState = readRunState(state.runId);
      if (diskState) Object.assign(state, diskState);

      const body = outputChunks.join("\n").trim();
      if (body && !state.outputPath) {
        writeFileSync(outputPath, `${body}\n`, "utf8");
        state.outputPath = outputPath;
      } else if (!outputMode && stdoutBuf.trim() && !state.outputPath) {
        writeFileSync(outputPath, `${stdoutBuf.trim()}\n`, "utf8");
        state.outputPath = outputPath;
      }
      ensureOutputPathOnState(state, runDir);

      if (code !== 0 || state.status === "failed") {
        if (state.status !== "failed") {
          state.status = "failed";
          state.error = stderr.trim() || `claude exited with code ${code ?? "unknown"}`;
        }
        ensureRunOutput(flow, state, outputPath, runDir, {
          status: "failed",
          error: state.error,
          stderr,
          partialStdout: body || stdoutBuf.trim(),
        });
        appendEvent(runDir, { type: "run.failed", error: state.error });
      } else {
        for (const phase of state.phases) {
          if (phase.status === "pending" || phase.status === "running") {
            phase.status = "done";
            phase.completedAt = new Date().toISOString();
          }
        }
        recomputeRunProgress(state);
        state.status = "completed";
        state.currentPhaseId = null;
        if (!state.outputPath) {
          const captured = body || stdoutBuf.trim();
          writeRunOutputIfMissing(
            state,
            outputPath,
            captured ||
              buildFallbackOutputMarkdown({
                flowId: flow.id,
                runId: state.runId,
                status: "failed",
                error: "Agent completed without flow_output",
              }),
          );
        }
        appendEvent(runDir, { type: "run.completed", outputPath: state.outputPath });
      }

      writeState(runDir, state);
      finish();
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      if (ctx.cancelled) {
        finish();
        return;
      }
      if (runSettled) {
        finish();
        return;
      }
      runSettled = true;
      state.status = "failed";
      state.error = err.message;
      ensureRunOutput(flow, state, outputPath, runDir, {
        status: "failed",
        error: err.message,
        stderr,
        partialStdout: outputChunks.join("\n").trim() || stdoutBuf.trim(),
      });
      appendEvent(runDir, { type: "run.failed", error: state.error });
      writeState(runDir, state);
      finish();
    });
  });
}

export function readFlowFile(flowId: string): { content: string; path: string } | null {
  const flow = getFlowDefinition(flowId);
  if (!flow) return null;
  return { content: readFileSync(flow.filePath, "utf8"), path: flow.filePath };
}

export function getFlowDagNodeCommand(
  flowId: string,
  node: {
    kind: FlowDagNodeKind;
    phaseId?: string;
    phaseLabel?: string;
    phaseMessage?: string | null;
  },
  options: {
    globalToolLaunchArgs?: import("../tool-launch.js").ToolLaunchArgs;
    runId?: string;
    outputPath?: string | null;
  } = {},
): FlowDagNodeCommandDetail | { error: string } {
  const flow = getFlowDefinition(flowId);
  if (!flow) return { error: `Flow not found: ${flowId}` };
  return getFlowDagNodeCommandDetail(flow, node, options);
}

export function createFlowFromContent(
  content: string,
  options: { overwrite?: boolean; migrateChatFromDraft?: boolean } = {},
): { ok: boolean; flowId?: string; path?: string; error?: string } {
  initFlowDirs();
  const fileName = "draft.flow.md";
  const parsed = parseFlowDocument(content, fileName, join(flowsDir(), fileName));
  if ("error" in parsed) {
    return { ok: false, error: parsed.error };
  }

  const destName = `${parsed.id}.flow.md`;
  const destPath = join(flowsDir(), destName);
  if (!options.overwrite && existsSync(destPath)) {
    return { ok: false, error: `Flow already exists: ${parsed.id}` };
  }

  try {
    const normalized = ensureFlowDefaultsInContent(content);
    if ("error" in normalized) {
      return { ok: false, error: normalized.error };
    }
    const toWrite = normalized.content.endsWith("\n") ? normalized.content : `${normalized.content}\n`;
    writeFileSync(destPath, toWrite, "utf8");
    if (options.migrateChatFromDraft !== false) {
      migrateFlowChat(FLOW_CHAT_DRAFT_ID, parsed.id);
    }
    return { ok: true, flowId: parsed.id, path: destPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

function ensureOutputPathOnState(state: FlowRunState, runDir: string): void {
  if (state.outputPath && existsSync(state.outputPath)) return;
  const fallback = join(runDir, "output.md");
  if (existsSync(fallback)) {
    state.outputPath = fallback;
  }
}

function ensureRunOutput(
  flow: FlowDefinition,
  state: FlowRunState,
  outputPath: string,
  runDir: string,
  details: {
    status: "failed" | "cancelled";
    error?: string | null;
    stderr?: string;
    partialStdout?: string;
  },
): void {
  if (writeRunOutputIfMissing(
    state,
    outputPath,
    buildFallbackOutputMarkdown({
      flowId: flow.id,
      runId: state.runId,
      status: details.status,
      error: details.error ?? state.error,
      stderr: details.stderr,
      partialStdout: details.partialStdout,
    }),
  )) {
    appendEvent(runDir, {
      type: "flow.output",
      outputPath: state.outputPath,
      source: "runner",
    });
  }
}

export function readRunOutput(
  runId: string,
): { ok: boolean; content?: string; outputPath?: string; startedAt?: string; error?: string } {
  const state = getFlowRunState(runId);
  let outputPath = state?.outputPath ?? null;
  if (!outputPath || !existsSync(outputPath)) {
    const fallback = join(runsDir(), runId, "output.md");
    if (existsSync(fallback)) {
      outputPath = fallback;
    }
  }
  if (!outputPath || !existsSync(outputPath)) {
    return { ok: false, error: "Output not found for this run" };
  }
  try {
    const content = readFileSync(outputPath, "utf8");
    return { ok: true, content, outputPath, startedAt: state?.startedAt };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function getLatestRunWithOutput(
  flowId: string,
): { runId: string; outputPath: string; startedAt: string; status: FlowRunState["status"] } | null {
  const runs = listRunsForFlow(flowId, 30);
  for (const run of runs) {
    const resolved = readRunOutput(run.runId);
    if (resolved.ok && resolved.outputPath) {
      return {
        runId: run.runId,
        outputPath: resolved.outputPath,
        startedAt: run.startedAt,
        status: run.status,
      };
    }
  }
  return null;
}

export function deleteFlow(flowId: string): { ok: boolean; error?: string } {
  if (runsInFlight.has(flowId)) {
    return { ok: false, error: "Flow is running" };
  }
  const flow = getFlowDefinition(flowId);
  if (!flow) return { ok: false, error: `Flow not found: ${flowId}` };
  try {
    unlinkSync(flow.filePath);
    deleteFlowChatData(flowId);
    deleteRunsForFlow(flowId);
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function getFlowFilePath(flowId: string): string | null {
  return getFlowDefinition(flowId)?.filePath ?? null;
}

export function saveFlowSchedule(
  flowId: string,
  patch: { schedule: string | null; timezone?: string | null },
): { ok: boolean; error?: string } {
  const flow = getFlowDefinition(flowId);
  if (!flow) return { ok: false, error: `Flow not found: ${flowId}` };

  const content = readFileSync(flow.filePath, "utf8");
  const updated = patchFlowScheduleInContent(content, patch);
  if ("error" in updated) return { ok: false, error: updated.error };

  try {
    writeFileSync(flow.filePath, updated.content, "utf8");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function saveFlowRunner(
  flowId: string,
  patch: {
    tool?: string | null;
    toolArgs?: string | null;
    cwd?: string | null;
    profile?: string | null;
  },
): { ok: boolean; error?: string } {
  const flow = getFlowDefinition(flowId);
  if (!flow) return { ok: false, error: `Flow not found: ${flowId}` };
  if (flow.runner !== "claude") {
    return { ok: false, error: "Runner settings apply only to agent flows" };
  }

  const content = readFileSync(flow.filePath, "utf8");
  const patched = patchFlowRunnerInContent(content, patch);
  if ("error" in patched) return { ok: false, error: patched.error };
  const normalized = ensureFlowDefaultsInContent(patched.content);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  try {
    writeFileSync(flow.filePath, normalized.content, "utf8");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export function listRecentRuns(limit = 20): FlowRunState[] {
  initFlowDirs();
  if (!existsSync(runsDir())) return [];
  const dirs = readdirSync(runsDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse()
    .slice(0, limit);

  const states: FlowRunState[] = [];
  for (const runId of dirs) {
    const state = getFlowRunState(runId);
    if (state) states.push(state);
  }
  return states;
}

export function listRunsForFlow(flowId: string, limit = 30): FlowRunState[] {
  initFlowDirs();
  if (!existsSync(runsDir())) return [];
  const suffix = `-${flowId}`;
  const dirs = readdirSync(runsDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith(suffix))
    .map((d) => d.name)
    .sort()
    .reverse()
    .slice(0, limit);

  const states: FlowRunState[] = [];
  for (const runId of dirs) {
    const state = getFlowRunState(runId);
    if (state) states.push(state);
  }
  return states;
}

export function getRunEvents(runId: string): FlowRunEvent[] {
  const path = join(runsDir(), runId, "events.jsonl");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const events: FlowRunEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as FlowRunEvent);
    } catch {
      /* skip malformed */
    }
  }
  return events;
}

export function getRunArtifactPath(runId: string, artifact: FlowRunArtifact): string | null {
  const runDir = join(runsDir(), runId);
  if (!existsSync(runDir)) return null;

  switch (artifact) {
    case "prompt": {
      const p = join(runDir, "prompt.md");
      return existsSync(p) ? p : null;
    }
    case "events": {
      const p = join(runDir, "events.jsonl");
      return existsSync(p) ? p : null;
    }
    case "output": {
      const state = getFlowRunState(runId);
      if (state?.outputPath && existsSync(state.outputPath)) return state.outputPath;
      const fallback = join(runDir, "output.md");
      return existsSync(fallback) ? fallback : null;
    }
    case "runDir":
      return runDir;
    default:
      return null;
  }
}

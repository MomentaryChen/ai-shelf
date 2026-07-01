import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import { cronNextRun, shouldRunFlowNow } from "../shared/flow-cron.js";
import { parseFlowDocument } from "../shared/flow-parse.js";
import { FLOW_OUTPUT_BEGIN, FLOW_PROGRESS_PREFIX, buildRunnerPrompt } from "../shared/flow-protocol.js";
import { readFlowLastSlot, writeFlowLastSlot } from "../shared/flow-schedule-pref.js";
import {
  FLOW_RUN_STATE_SCHEMA,
  type FlowDefinition,
  type FlowListItem,
  type FlowProgressEvent,
  type FlowRunState,
} from "../shared/flow-types.js";
import { notifyFlowRunFailed } from "./flow-notify.js";
import { patchFlowScheduleInContent } from "../shared/flow-frontmatter-patch.js";

type RunStateListener = (state: FlowRunState) => void;

const activeRuns = new Map<string, FlowRunState>();
const runListeners = new Set<RunStateListener>();
const runsInFlight = new Set<string>();

function flowsDir(): string {
  return join(getAppDataDir(), "flows");
}

function runsDir(): string {
  return join(getAppDataDir(), "runs");
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
  state.updatedAt = new Date().toISOString();
  writeFileSync(join(runDir, "state.json"), JSON.stringify(state, null, 2), "utf8");
  broadcastState(state);
}

function appendEvent(runDir: string, event: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), ...event });
  appendFileSync(join(runDir, "events.jsonl"), `${line}\n`, "utf8");
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

function recomputeProgress(state: FlowRunState): void {
  const total = state.phases.length;
  const completed = state.phases.filter((p) => p.status === "done" || p.status === "skipped").length;
  state.progress = {
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
  };
}

function applyProgressEvent(state: FlowRunState, event: FlowProgressEvent): void {
  if (!event.phaseId) return;
  const phase = state.phases.find((p) => p.id === event.phaseId);
  if (!phase) return;

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
      break;
    case "phase.skipped":
      phase.status = "skipped";
      phase.completedAt = now;
      break;
    case "phase.message":
      phase.message = event.message ?? phase.message;
      break;
    default:
      break;
  }
  recomputeProgress(state);
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

function spawnClaudePrompt(prompt: string): ReturnType<typeof spawn> {
  if (process.platform === "win32") {
    return spawn("pwsh.exe", ["-NoProfile", "-Command", "claude", "-p", prompt], {
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return spawn("claude", ["-p", prompt], {
    windowsHide: true,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
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

export type RunFlowOptions = {
  wait?: boolean;
  trigger?: "manual" | "schedule";
  scheduleSlotKey?: string;
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
  const runId = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}-${flow.id}`;
  const runDir = join(runsDir(), runId);
  mkdirSync(runDir, { recursive: true });

  const state = initialRunState(flow, runId, runDir);
  state.status = "running";
  writeState(runDir, state);
  appendEvent(runDir, { type: "run.started", flowId, trigger: options.trigger ?? "manual" });

  runsInFlight.add(flowId);

  const runPromise = executeFlowRun(flow, runDir, state).finally(() => {
    runsInFlight.delete(flowId);
    if (state.status === "failed") {
      void notifyFlowRunFailed(flow, state);
    }
    if (options.scheduleSlotKey) {
      writeFlowLastSlot(flow.id, options.scheduleSlotKey);
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

export async function runDueFlows(now = new Date()): Promise<RunDueFlowsResult> {
  initFlowDirs();
  const result: RunDueFlowsResult = { checked: 0, started: [], skipped: [], errors: [] };
  const files = readdirSync(flowsDir()).filter((f) => f.endsWith(".flow.md"));

  for (const fileName of files.sort()) {
    const filePath = join(flowsDir(), fileName);
    const content = readFileSync(filePath, "utf8");
    const parsed = parseFlowDocument(content, fileName, filePath);
    if ("error" in parsed || !parsed.schedule || !parsed.enabled) continue;

    result.checked += 1;
    const tz = parsed.timezone ?? "Asia/Taipei";
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

    const run = await runFlow(parsed.id, {
      wait: true,
      trigger: "schedule",
      scheduleSlotKey: slotKey,
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
): Promise<void> {
  const url = flow.httpUrl;
  if (!url) {
    state.status = "failed";
    state.error = "HTTP runner requires frontmatter url";
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

  try {
    const res = await fetch(url, {
      method: flow.httpMethod,
      signal: AbortSignal.timeout(flow.timeoutSec * 1000),
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
    recomputeProgress(state);
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
    if (phase) {
      phase.status = "failed";
      phase.completedAt = new Date().toISOString();
      phase.message = message;
    }
    state.status = "failed";
    state.error = message;
    appendEvent(runDir, { type: "run.failed", error: message });
  }

  writeState(runDir, state);
}

async function executeFlowRun(
  flow: FlowDefinition,
  runDir: string,
  state: FlowRunState,
): Promise<void> {
  const outputPath = flow.outputTemplate
    ? expandPathTemplate(flow.outputTemplate, flow.id)
    : join(runDir, "output.md");

  mkdirSync(dirname(outputPath), { recursive: true });

  if (flow.runner === "http") {
    await executeHttpFlow(flow, runDir, state, outputPath);
    return;
  }

  const prompt = buildRunnerPrompt(flow.body, flow.phases.map((p) => p.id));

  writeFileSync(join(runDir, "prompt.md"), prompt, "utf8");

  await new Promise<void>((resolve) => {
    let outputMode = false;
    const outputChunks: string[] = [];
    let stderr = "";
    let stdoutBuf = "";

    const handleLine = (line: string) => {
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

    const child = spawnClaudePrompt(prompt);

    const timeout = setTimeout(() => {
      child.kill();
      state.status = "failed";
      state.error = `Timed out after ${flow.timeoutSec}s`;
      appendEvent(runDir, { type: "run.failed", error: state.error });
      writeState(runDir, state);
      resolve();
    }, flow.timeoutSec * 1000);

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

      const body = outputChunks.join("\n").trim();
      if (body) {
        writeFileSync(outputPath, `${body}\n`, "utf8");
        state.outputPath = outputPath;
      } else if (!outputMode && stdoutBuf.trim()) {
        writeFileSync(outputPath, `${stdoutBuf.trim()}\n`, "utf8");
        state.outputPath = outputPath;
      }

      if (code !== 0 || state.status === "failed") {
        if (state.status !== "failed") {
          state.status = "failed";
          state.error = stderr.trim() || `claude exited with code ${code ?? "unknown"}`;
        }
        appendEvent(runDir, { type: "run.failed", error: state.error });
      } else {
        for (const phase of state.phases) {
          if (phase.status === "pending" || phase.status === "running") {
            phase.status = "done";
            phase.completedAt = new Date().toISOString();
          }
        }
        recomputeProgress(state);
        state.status = "completed";
        state.currentPhaseId = null;
        appendEvent(runDir, { type: "run.completed", outputPath: state.outputPath });
      }

      writeState(runDir, state);
      resolve();
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      state.status = "failed";
      state.error = err.message;
      appendEvent(runDir, { type: "run.failed", error: state.error });
      writeState(runDir, state);
      resolve();
    });
  });
}

export function readFlowFile(flowId: string): { content: string; path: string } | null {
  const flow = getFlowDefinition(flowId);
  if (!flow) return null;
  return { content: readFileSync(flow.filePath, "utf8"), path: flow.filePath };
}

export function deleteFlow(flowId: string): { ok: boolean; error?: string } {
  if (runsInFlight.has(flowId)) {
    return { ok: false, error: "Flow is running" };
  }
  const flow = getFlowDefinition(flowId);
  if (!flow) return { ok: false, error: `Flow not found: ${flowId}` };
  try {
    unlinkSync(flow.filePath);
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

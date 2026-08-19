import { readFile } from "node:fs/promises";
import { cpus, freemem, platform, release, arch, totalmem, type CpuInfo } from "node:os";
import { run } from "../utils/exec.js";
import { spawnAgentPrint } from "../flow/claude-spawn.js";
import { buildToolLaunchCommand } from "../tool-launch.js";
import { TOOL_LAUNCH_CMD } from "../tools.js";
import { applyFlowClaudeDefaultModel } from "../shared/claude-tool-args.js";
import {
  buildEnvAnalyzePrompt,
  extractReportMarkdown,
  MAX_LISTENERS_IN_SNAPSHOT,
  parseNetstatE,
  parseNetstatIb,
  parseNvidiaSmi,
  parseProcNetDev,
  type HostEnvSnapshot,
  type HostResourceSnapshot,
} from "../shared/host-env.js";
import { filterListeners } from "../shared/port-listeners.js";
import { listAllListeners } from "./ports-list.js";

const SAMPLE_MS = 300;
const ANALYZE_TIMEOUT_MS = 90_000;

let analyzeInFlight = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cpuIdleTotal(list: CpuInfo[]): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of list) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function cpuUsageFromDelta(a: { idle: number; total: number }, b: { idle: number; total: number }): number | null {
  const idle = b.idle - a.idle;
  const total = b.total - a.total;
  if (total <= 0) return null;
  return Math.round((1 - idle / total) * 1000) / 10;
}

async function readNetBytes(): Promise<{ rx: number; tx: number } | null> {
  const os = platform();
  if (os === "win32") {
    const result = await run("netstat", ["-e"], 8_000);
    return parseNetstatE(result.stdout);
  }
  if (os === "linux") {
    try {
      return parseProcNetDev(await readFile("/proc/net/dev", "utf8"));
    } catch {
      return null;
    }
  }
  const result = await run("netstat", ["-ib"], 8_000);
  return parseNetstatIb(result.stdout);
}

let gpuRetryAt = 0;

async function readGpu() {
  if (Date.now() < gpuRetryAt) return null;
  const result = await run(
    "nvidia-smi",
    ["--query-gpu=name,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
    2_500,
  );
  if (!result.ok || !result.stdout.trim()) {
    gpuRetryAt = Date.now() + 30_000;
    return null;
  }
  const parsed = parseNvidiaSmi(result.stdout);
  if (!parsed) gpuRetryAt = Date.now() + 30_000;
  return parsed;
}

function rate(before: number, after: number, elapsedMs: number): number | null {
  if (elapsedMs <= 0) return null;
  const delta = after - before;
  if (!Number.isFinite(delta) || delta < 0) return null;
  return Math.round((delta * 1000) / elapsedMs);
}

export async function collectHostResources(): Promise<HostResourceSnapshot> {
  const cpuList = cpus();
  const cpuA = cpuIdleTotal(cpuList);
  const netA = await readNetBytes();
  const t0 = Date.now();
  await sleep(SAMPLE_MS);
  const cpuB = cpuIdleTotal(cpus());
  const netB = await readNetBytes();
  const elapsedMs = Math.max(1, Date.now() - t0);

  const total = totalmem();
  const free = freemem();

  return {
    capturedAt: new Date().toISOString(),
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: {
      model: cpuList[0]?.model.trim() || "unknown",
      cores: cpuList.length,
      usagePercent: cpuUsageFromDelta(cpuA, cpuB),
    },
    memory: {
      totalBytes: total,
      usedBytes: Math.max(0, total - free),
    },
    network: {
      rxBytesPerSec: netA && netB ? rate(netA.rx, netB.rx, elapsedMs) : null,
      txBytesPerSec: netA && netB ? rate(netA.tx, netB.tx, elapsedMs) : null,
    },
    gpu: await readGpu(),
  };
}

export async function collectHostEnvSnapshot(): Promise<HostEnvSnapshot> {
  const resources = await collectHostResources();
  const listeners = filterListeners(await listAllListeners(null), null).slice(0, MAX_LISTENERS_IN_SNAPSHOT);
  return { ...resources, listeners };
}

export type AnalyzeEnvResult =
  | { ok: true; report: string }
  | { ok: false; error: string; code: "no-claude" | "timeout" | "failed" };

function isMissingClaude(err: string): boolean {
  return /ENOENT|not recognized|not found|cannot find/iu.test(err);
}

function stopChildTree(child: { pid?: number; kill: () => void }): void {
  if (platform() === "win32" && child.pid) {
    void run("taskkill", ["/PID", String(child.pid), "/T", "/F"], 8_000);
    return;
  }
  child.kill();
}

export async function analyzeHostEnv(locale: "en" | "zh"): Promise<AnalyzeEnvResult> {
  if (analyzeInFlight) {
    return { ok: false, error: "already running", code: "failed" };
  }
  analyzeInFlight = true;

  try {
    const snapshot = await collectHostEnvSnapshot();
    const prompt = buildEnvAnalyzePrompt(snapshot, locale);
    const launchCommand = buildToolLaunchCommand(
      TOOL_LAUNCH_CMD.claude ?? "claude",
      applyFlowClaudeDefaultModel(""),
    );

    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      const child = spawnAgentPrint({ launchCommand, prompt });

      const finish = (result: AnalyzeEnvResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        stopChildTree(child);
        finish({ ok: false, error: "timed out", code: "timeout" });
      }, ANALYZE_TIMEOUT_MS);

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err) => {
        const message = err.message;
        finish({
          ok: false,
          error: message,
          code: isMissingClaude(message) ? "no-claude" : "failed",
        });
      });
      child.on("close", (code) => {
        const raw = stdout.trim();
        if (code !== 0) {
          const err = stderr.trim() || `claude exited with code ${String(code ?? "unknown")}`;
          finish({
            ok: false,
            error: err,
            code: isMissingClaude(err) ? "no-claude" : "failed",
          });
          return;
        }
        const report = extractReportMarkdown(raw);
        if (!report) {
          finish({ ok: false, error: "empty report", code: "failed" });
          return;
        }
        finish({ ok: true, report });
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: "failed",
    };
  } finally {
    analyzeInFlight = false;
  }
}


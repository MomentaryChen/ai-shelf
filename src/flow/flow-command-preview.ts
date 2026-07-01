import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import type { FlowDefinition } from "../shared/flow-types.js";
import type { ToolLaunchArgs } from "../tool-launch.js";
import type { FlowPromptLogEntry } from "../shared/flow-chat-types.js";
import { resolveFlowRunner } from "./flow-runner-resolve.js";
import { prepareFlowAgentSpawn } from "./mcp-config.js";
import { listFlowPromptLogs } from "./flow-chat-store.js";

function quoteCmdArg(arg: string): string {
  if (!/[\s"]/u.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

export function formatCliArgsCommandLine(cliArgs: string[]): string {
  return cliArgs.map(quoteCmdArg).join(" ");
}

function windowsNeedsCmdShim(cmd: string): boolean {
  if (/\.exe$/iu.test(cmd)) return false;
  if (/\.(cmd|bat)$/iu.test(cmd)) return true;
  return !/[\\/]/u.test(cmd);
}

function windowsCmdShimLine(commandLine: string): string | undefined {
  if (platform() !== "win32") return undefined;
  const bin = commandLine.trim().split(/\s+/)[0] ?? "";
  if (!windowsNeedsCmdShim(bin)) return undefined;
  const comspec = process.env.ComSpec ?? "cmd.exe";
  return `${comspec} /d /s /c ${quoteCmdArg(commandLine)}`;
}

export type FlowDagNodeKind = "trigger" | "phase" | "output";

export type FlowDagNodeCommandDetail = {
  kind: FlowDagNodeKind;
  title: string;
  commandLine?: string;
  cwd?: string;
  stdinNote?: string;
  httpMethod?: string;
  httpUrl?: string;
  phaseId?: string;
  phaseLabel?: string;
  phaseMessage?: string | null;
  outputPath?: string | null;
  source: "logged" | "preview" | "static";
};

function findLoggedRunCommand(
  flowId: string,
  runId: string,
): FlowPromptLogEntry | undefined {
  const logs = listFlowPromptLogs(flowId, 100);
  return [...logs].reverse().find((e) => e.kind === "run" && e.runId === runId);
}

export function buildFlowAgentCliArgs(
  flow: FlowDefinition,
  options: {
    globalToolLaunchArgs?: ToolLaunchArgs;
    runId?: string;
    outputPath?: string;
  } = {},
): { cliArgs: string[]; cwd: string; tool: string } | { error: string } {
  const resolved = resolveFlowRunner(flow, {
    globalToolLaunchArgs: options.globalToolLaunchArgs,
  });
  if ("error" in resolved) return resolved;

  const runId = options.runId ?? "preview-run-id";
  const outputPath =
    options.outputPath ?? join(tmpdir(), `ai-shelf-flow-preview-${runId}-output.md`);

  const prep = prepareFlowAgentSpawn(resolved.tool, runId, outputPath, resolved.cwd);
  const printArgs = [...prep.printPrefix, ...prep.extraArgs];
  const cliArgs = [...resolved.launchCommand.trim().split(/\s+/), ...printArgs];

  return { cliArgs, cwd: resolved.cwd, tool: resolved.tool };
}

export function getFlowDagNodeCommandDetail(
  flow: FlowDefinition,
  node: { kind: FlowDagNodeKind; phaseId?: string; phaseLabel?: string; phaseMessage?: string | null },
  options: {
    globalToolLaunchArgs?: ToolLaunchArgs;
    runId?: string;
    outputPath?: string | null;
  } = {},
): FlowDagNodeCommandDetail | { error: string } {
  if (node.kind === "output") {
    return {
      kind: "output",
      title: "output",
      outputPath: options.outputPath ?? null,
      source: "static",
    };
  }

  if (node.kind === "phase") {
    return {
      kind: "phase",
      title: node.phaseLabel ?? node.phaseId ?? "phase",
      phaseId: node.phaseId,
      phaseLabel: node.phaseLabel,
      phaseMessage: node.phaseMessage,
      source: "static",
    };
  }

  if (flow.runner === "http") {
    return {
      kind: "trigger",
      title: "http",
      commandLine: flow.httpUrl
        ? `fetch ${flow.httpMethod} ${flow.httpUrl}`
        : undefined,
      httpMethod: flow.httpMethod,
      httpUrl: flow.httpUrl,
      source: "static",
    };
  }

  const logged =
    options.runId && flow.id
      ? findLoggedRunCommand(flow.id, options.runId)
      : undefined;

  if (logged?.cliArgs?.length) {
    const commandLine = formatCliArgsCommandLine(logged.cliArgs);
    const built = buildFlowAgentCliArgs(flow, {
      globalToolLaunchArgs: options.globalToolLaunchArgs,
      runId: options.runId,
      outputPath: options.outputPath ?? undefined,
    });
    const cwd = !("error" in built) ? built.cwd : undefined;
    const shim = windowsCmdShimLine(commandLine);
    return {
      kind: "trigger",
      title: "agent",
      commandLine: shim ?? commandLine,
      cwd,
      stdinNote: "prompt",
      source: "logged",
    };
  }

  const built = buildFlowAgentCliArgs(flow, {
    globalToolLaunchArgs: options.globalToolLaunchArgs,
    runId: options.runId,
    outputPath: options.outputPath ?? undefined,
  });
  if ("error" in built) return built;

  const commandLine = formatCliArgsCommandLine(built.cliArgs);
  const shim = windowsCmdShimLine(commandLine);
  return {
    kind: "trigger",
    title: "agent",
    commandLine: shim ?? commandLine,
    cwd: built.cwd,
    stdinNote: "prompt",
    source: "preview",
  };
}

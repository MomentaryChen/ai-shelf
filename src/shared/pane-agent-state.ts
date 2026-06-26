/** Pane agent activity states for multi-pane terminal awareness. */

import { normalizePtyText } from "./pty-output-search.js";

export type PaneAgentStatus = "idle" | "running" | "waiting_input" | "stalled";

export interface PaneAgentState {
  status: PaneAgentStatus;
  lastOutputAt: number;
  lastUserInputAt: number;
  /** Rolling ANSI-stripped tail used for prompt heuristics. */
  tail: string;
  wasRunning: boolean;
}

export interface PaneAgentStateOptions {
  /** Output within this window keeps status as running. */
  runningGraceMs: number;
  /** No output for this long while busy → stalled; 0 disables. */
  stallTimeoutMs: number;
  /** Max chars retained in tail buffer. */
  tailMaxChars: number;
}

export const DEFAULT_PANE_AGENT_OPTIONS: PaneAgentStateOptions = {
  runningGraceMs: 2_500,
  stallTimeoutMs: 120_000,
  tailMaxChars: 4_096,
};

const SPINNER_CHARS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◑◒◓◴◕⣾⣽⣻⢿⡿⣟⣯⣷]/;

const WAITING_INPUT_PATTERNS: RegExp[] = [
  /\(\s*[yY]\s*\/\s*[nN]\s*\)/,
  /\[\s*[yY]\s*\/\s*[nN]\s*\]/,
  /\bpress\s+enter\b/i,
  /\ballow\s+this\b/i,
  /\bdo you want\b/i,
  /\bwould you like\b/i,
  /\bwaiting\s+for\s+(your\s+)?input\b/i,
  /\bneeds?\s+(your\s+)?approval\b/i,
  /\bpermission\s+to\b/i,
  /[❯›]\s*$/,
];

const RUNNING_INDICATOR_PATTERNS: RegExp[] = [
  /\besc\b.*\binterrupt\b/i,
  /\bthinking\b/i,
  /\bworking\b/i,
  /\brunning\b/i,
  /\bstreaming\b/i,
  /\bcompiling\b/i,
  /\binstalling\b/i,
  /\bwaiting\s+for\s+tool\b/i,
];

export function createPaneAgentState(now = Date.now()): PaneAgentState {
  return {
    status: "idle",
    lastOutputAt: now,
    lastUserInputAt: 0,
    tail: "",
    wasRunning: false,
  };
}

function appendTail(prev: string, chunk: string, maxChars: number): string {
  const next = prev + normalizePtyText(chunk);
  return next.length <= maxChars ? next : next.slice(-maxChars);
}

function tailWindow(tail: string, lineCount = 12): string {
  const lines = tail.split(/\r?\n/);
  return lines.slice(-lineCount).join("\n").trimEnd();
}

export function detectWaitingInput(tail: string): boolean {
  const window = tailWindow(tail);
  if (!window) return false;
  return WAITING_INPUT_PATTERNS.some((re) => re.test(window));
}

export function detectRunningIndicators(tail: string): boolean {
  const window = tailWindow(tail, 6);
  if (!window) return false;
  if (SPINNER_CHARS.test(window)) return true;
  return RUNNING_INDICATOR_PATTERNS.some((re) => re.test(window));
}

export function classifyPaneAgentState(
  state: Pick<PaneAgentState, "tail" | "lastOutputAt" | "wasRunning">,
  now: number,
  opts: PaneAgentStateOptions,
): PaneAgentStatus {
  const msSinceOutput = now - state.lastOutputAt;

  if (detectWaitingInput(state.tail)) return "waiting_input";

  const activeOutput = msSinceOutput < opts.runningGraceMs;
  const busyMarkers = detectRunningIndicators(state.tail);

  if (activeOutput || busyMarkers) return "running";

  if (
    opts.stallTimeoutMs > 0 &&
    state.wasRunning &&
    msSinceOutput >= opts.stallTimeoutMs
  ) {
    return "stalled";
  }

  return "idle";
}

export function applyPaneAgentOutput(
  prev: PaneAgentState,
  chunk: string,
  now: number,
  opts: PaneAgentStateOptions = DEFAULT_PANE_AGENT_OPTIONS,
): PaneAgentState {
  const tail = appendTail(prev.tail, chunk, opts.tailMaxChars);
  const lastOutputAt = now;
  const interim: PaneAgentState = {
    ...prev,
    tail,
    lastOutputAt,
  };
  const status = classifyPaneAgentState(interim, now, opts);
  return {
    ...interim,
    status,
    wasRunning: status === "running" || (prev.wasRunning && status === "stalled"),
  };
}

export function applyPaneAgentUserInput(
  prev: PaneAgentState,
  now: number,
  opts: PaneAgentStateOptions = DEFAULT_PANE_AGENT_OPTIONS,
): PaneAgentState {
  const next: PaneAgentState = {
    ...prev,
    lastUserInputAt: now,
    wasRunning: false,
    status: "running",
  };
  return {
    ...next,
    status: classifyPaneAgentState(next, now, opts),
  };
}

export function tickPaneAgentState(
  prev: PaneAgentState,
  now: number,
  opts: PaneAgentStateOptions = DEFAULT_PANE_AGENT_OPTIONS,
): PaneAgentState {
  const status = classifyPaneAgentState(prev, now, opts);
  return {
    ...prev,
    status,
    wasRunning:
      status === "running" ||
      status === "stalled" ||
      (prev.wasRunning && status !== "idle" && status !== "waiting_input"),
  };
}

/** Panes that should contribute to tray / notification attention count. */
export function paneNeedsAttention(status: PaneAgentStatus): boolean {
  return status === "waiting_input" || status === "stalled";
}

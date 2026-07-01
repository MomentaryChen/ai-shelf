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
  /** When the current continuous running spell started; null when not running. */
  runningSinceAt: number | null;
  /** Duration of the most recently finished running spell (ms). */
  lastRunningSpellMs: number;
}

export interface PaneAgentStateOptions {
  /** Output within this window keeps status as running. */
  runningGraceMs: number;
  /** Running tail markers only count within this window after the last output. */
  runningIndicatorMaxAgeMs: number;
  /** No output for this long while busy → stalled; 0 disables. */
  stallTimeoutMs: number;
  /** Max chars retained in tail buffer. */
  tailMaxChars: number;
}

export const DEFAULT_PANE_AGENT_OPTIONS: PaneAgentStateOptions = {
  runningGraceMs: 2_500,
  runningIndicatorMaxAgeMs: 12_000,
  stallTimeoutMs: 120_000,
  tailMaxChars: 4_096,
};

/** Minimum continuous running time before a "ready" desktop notification. */
export const PANE_AGENT_MIN_RUNNING_FOR_READY_MS = 5_000;

/** Idle must stay stable this long before a "ready" notification fires. */
export const PANE_AGENT_READY_IDLE_STABLE_MS = 8_000;

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
    runningSinceAt: null,
    lastRunningSpellMs: 0,
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
  const recentBusyMarkers =
    msSinceOutput < opts.runningIndicatorMaxAgeMs && detectRunningIndicators(state.tail);

  if (activeOutput || recentBusyMarkers) return "running";

  if (
    opts.stallTimeoutMs > 0 &&
    state.wasRunning &&
    msSinceOutput >= opts.stallTimeoutMs
  ) {
    return "stalled";
  }

  return "idle";
}

function isActiveRunningStatus(status: PaneAgentStatus): boolean {
  return status === "running" || status === "stalled";
}

function withStatus(
  prev: PaneAgentState,
  status: PaneAgentStatus,
  now: number,
): PaneAgentState {
  const active = isActiveRunningStatus(status);
  let runningSinceAt = prev.runningSinceAt;
  let lastRunningSpellMs = prev.lastRunningSpellMs;

  if (active && !isActiveRunningStatus(prev.status)) {
    runningSinceAt = now;
  } else if (!active) {
    if (isActiveRunningStatus(prev.status) && prev.runningSinceAt !== null) {
      lastRunningSpellMs = Math.max(0, now - prev.runningSinceAt);
    }
    runningSinceAt = null;
  }

  return {
    ...prev,
    status,
    runningSinceAt,
    lastRunningSpellMs,
    wasRunning: status === "running" || (prev.wasRunning && status === "stalled"),
  };
}

/** Continuous running duration for the current spell; 0 when not in a running spell. */
export function paneRunningDurationMs(
  state: Pick<PaneAgentState, "runningSinceAt" | "status">,
  now: number,
): number {
  if (!state.runningSinceAt || !isActiveRunningStatus(state.status)) return 0;
  return Math.max(0, now - state.runningSinceAt);
}

export function applyPaneAgentOutput(
  prev: PaneAgentState,
  chunk: string,
  now: number,
  opts: PaneAgentStateOptions = DEFAULT_PANE_AGENT_OPTIONS,
): PaneAgentState {
  const tail = appendTail(prev.tail, chunk, opts.tailMaxChars);
  const interim: PaneAgentState = {
    ...prev,
    tail,
    lastOutputAt: now,
  };
  const status = classifyPaneAgentState(interim, now, opts);
  return withStatus(interim, status, now);
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
    runningSinceAt: now,
    lastRunningSpellMs: 0,
    status: "running",
  };
  const status = classifyPaneAgentState(next, now, opts);
  return withStatus(next, status, now);
}

export function tickPaneAgentState(
  prev: PaneAgentState,
  now: number,
  opts: PaneAgentStateOptions = DEFAULT_PANE_AGENT_OPTIONS,
): PaneAgentState {
  const status = classifyPaneAgentState(prev, now, opts);
  const next = withStatus(prev, status, now);
  return {
    ...next,
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

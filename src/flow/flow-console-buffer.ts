import type {
  FlowConsoleBufferSnapshot,
  FlowConsoleChunk,
  FlowConsoleStream,
} from "../shared/flow-console-types.js";

const DEFAULT_MAX_CHARS = 512 * 1024;

type BufferEntry = {
  flowId: string;
  text: string;
  truncated: boolean;
  phaseId: string | null;
  seq: number;
  alive: boolean;
};

const buffers = new Map<string, BufferEntry>();
/** flowId → current runId (so a new run can drop the previous buffer). */
const activeRunByFlow = new Map<string, string>();

export function beginFlowConsole(flowId: string, runId: string): void {
  const prev = activeRunByFlow.get(flowId);
  if (prev && prev !== runId) {
    buffers.delete(prev);
  }
  activeRunByFlow.set(flowId, runId);
  buffers.set(runId, {
    flowId,
    text: "",
    truncated: false,
    phaseId: null,
    seq: 0,
    alive: true,
  });
}

export function markFlowConsoleFinished(runId: string): void {
  const entry = buffers.get(runId);
  if (entry) entry.alive = false;
}

export function clearFlowConsole(runId: string): void {
  const entry = buffers.get(runId);
  if (entry) {
    if (activeRunByFlow.get(entry.flowId) === runId) {
      activeRunByFlow.delete(entry.flowId);
    }
  }
  buffers.delete(runId);
}

export function appendFlowConsole(
  runId: string,
  input: {
    flowId: string;
    phaseId: string | null;
    stream: FlowConsoleStream;
    data: string;
    maxChars?: number;
  },
): FlowConsoleChunk {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  let entry = buffers.get(runId);
  if (!entry) {
    entry = {
      flowId: input.flowId,
      text: "",
      truncated: false,
      phaseId: null,
      seq: 0,
      alive: true,
    };
    buffers.set(runId, entry);
    activeRunByFlow.set(input.flowId, runId);
  }

  entry.seq += 1;
  if (input.phaseId != null) entry.phaseId = input.phaseId;

  let next = entry.text + input.data;
  if (next.length > maxChars) {
    entry.truncated = true;
    next = next.slice(-maxChars);
  }
  entry.text = next;

  return {
    runId,
    flowId: entry.flowId,
    phaseId: input.phaseId,
    stream: input.stream,
    data: input.data,
    seq: entry.seq,
    truncated: entry.truncated,
    ts: Date.now(),
  };
}

export function getFlowConsoleBuffer(runId: string): FlowConsoleBufferSnapshot {
  const entry = buffers.get(runId);
  if (!entry) {
    return {
      runId,
      text: "",
      truncated: false,
      phaseId: null,
      alive: false,
      lastSeq: 0,
    };
  }
  return {
    runId,
    text: entry.text,
    truncated: entry.truncated,
    phaseId: entry.phaseId,
    alive: entry.alive,
    lastSeq: entry.seq,
  };
}

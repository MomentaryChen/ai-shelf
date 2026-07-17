export type FlowConsoleStream = "stdout" | "stderr";

/** Live chunk pushed from main → renderer while a print-mode agent runs. */
export type FlowConsoleChunk = {
  runId: string;
  flowId: string;
  phaseId: string | null;
  stream: FlowConsoleStream;
  data: string;
  /** Monotonic sequence per runId (survives coalescing). */
  seq: number;
  /** True when the ring buffer dropped older bytes. */
  truncated: boolean;
  ts: number;
};

/** Snapshot returned by `flow-get-console-buffer` for mid-run attach. */
export type FlowConsoleBufferSnapshot = {
  runId: string;
  text: string;
  truncated: boolean;
  phaseId: string | null;
  /** True while the run still has an active process context. */
  alive: boolean;
  /** Last seq included in `text` (0 if empty). */
  lastSeq: number;
};

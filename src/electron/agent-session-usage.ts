import { open, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AgentSessionUsage } from "../shared/agent-session-usage.js";
import {
  completeLinesLength,
  createClaudeUsageAccumulator,
  type ClaudeUsageAccumulator,
} from "../usage/claude-session-usage.js";
import { findClaudeTranscript } from "./agent-session.js";

/**
 * Live token / cost totals per terminal pane, read from the agent's transcript.
 *
 * pty-spawn records which agent conversation a PTY runs (only when it pinned a
 * session id — local panes, not WSL / SSH, whose transcripts live elsewhere).
 * The renderer polls by PTY session id; each poll reads only the bytes added
 * since the last one.
 *
 * Extension point: another tool joins by adding a reader to USAGE_READERS once
 * it has a reliable session id (see src/shared/agent-session-resume.ts).
 */

export interface TrackedAgentSession {
  tool: string;
  agentSessionId: string;
  /** Claude config dir the pane's process uses. */
  configDir: string;
  /** Spawn-time working dir (the transcript folder is derived from it). */
  cwd: string;
}

interface FileCursor {
  offset: number;
}

interface ClaudeReaderState {
  transcript: string;
  files: Map<string, FileCursor>;
  acc: ClaudeUsageAccumulator;
}

interface TrackedEntry extends TrackedAgentSession {
  state: ClaudeReaderState | null;
  inflight: Promise<AgentSessionUsage | null> | null;
}

const TRACKED = new Map<string, TrackedEntry>();

const READ_CHUNK_BYTES = 4 * 1024 * 1024;
/** A partial line longer than this is dropped (its remainder then fails to parse and is skipped). */
const MAX_LINE_BYTES = 32 * 1024 * 1024;

export function trackAgentSessionUsage(ptySessionId: string, info: TrackedAgentSession): void {
  TRACKED.set(ptySessionId, { ...info, state: null, inflight: null });
}

export function forgetAgentSessionUsage(ptySessionId: string): void {
  TRACKED.delete(ptySessionId);
}

/**
 * Read lines appended to `path` since `from`. Returns the new offset, or -1 when
 * the file shrank (rewritten) and the caller should start over.
 */
async function readAppended(
  path: string,
  from: number,
  onText: (text: string) => void,
): Promise<number> {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    if (size < from) return -1;
    let pos = from;
    let carry: Buffer | null = null;
    while (pos < size) {
      const len = Math.min(READ_CHUNK_BYTES, size - pos);
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, pos);
      if (bytesRead <= 0) break;
      pos += bytesRead;
      const data: Buffer = carry
        ? Buffer.concat([carry, buf.subarray(0, bytesRead)])
        : buf.subarray(0, bytesRead);
      const end = completeLinesLength(data);
      if (end > 0) onText(data.toString("utf8", 0, end));
      carry = end < data.length ? data.subarray(end) : null;
      if (carry && carry.length > MAX_LINE_BYTES) carry = null;
    }
    return pos - (carry?.length ?? 0);
  } finally {
    await fh.close();
  }
}

/** Sub-agent transcripts: `<project dir>/<sessionId>/subagents/*.jsonl`. */
async function subagentTranscripts(transcript: string): Promise<string[]> {
  const dir = join(dirname(transcript), basename(transcript, ".jsonl"), "subagents");
  try {
    const names = await readdir(dir);
    return names.filter((n) => n.endsWith(".jsonl")).map((n) => join(dir, n));
  } catch {
    return [];
  }
}

function freshClaudeState(transcript: string): ClaudeReaderState {
  return { transcript, files: new Map(), acc: createClaudeUsageAccumulator() };
}

async function readClaudeUsage(entry: TrackedEntry): Promise<AgentSessionUsage | null> {
  let state = entry.state;
  if (!state) {
    // Claude creates the transcript on the first message; look again each poll until then.
    const transcript = findClaudeTranscript(entry.configDir, entry.cwd, entry.agentSessionId);
    if (!transcript) return null;
    state = freshClaudeState(transcript);
    entry.state = state;
  }
  const { transcript, acc } = state;
  const paths = [transcript, ...(await subagentTranscripts(transcript))];
  for (const path of paths) {
    const cursor = state.files.get(path) ?? { offset: 0 };
    state.files.set(path, cursor);
    let next: number;
    try {
      next = await readAppended(path, cursor.offset, (text) => {
        acc.addText(text);
      });
    } catch {
      if (path === transcript) {
        // Transcript gone (deleted / moved) — find it again next poll.
        entry.state = null;
        return null;
      }
      continue;
    }
    if (next < 0) {
      // A file was rewritten; recount everything from scratch next poll.
      entry.state = freshClaudeState(transcript);
      return null;
    }
    cursor.offset = next;
  }
  const summary = acc.summary();
  return summary.messages > 0 ? summary : null;
}

const USAGE_READERS: Partial<
  Record<string, (entry: TrackedEntry) => Promise<AgentSessionUsage | null>>
> = {
  claude: readClaudeUsage,
};

/** Usage for the agent conversation running in a PTY, or null when unknown / unreadable. */
export async function readAgentSessionUsage(
  ptySessionId: string,
): Promise<AgentSessionUsage | null> {
  const entry = TRACKED.get(ptySessionId);
  if (!entry) return null;
  const reader = agentSessionUsageSupported(entry.tool) ? USAGE_READERS[entry.tool] : undefined;
  if (!reader) return null;
  // Concurrent polls (e.g. the pane shown in a view window too) share one read.
  if (!entry.inflight) {
    entry.inflight = reader(entry)
      .catch(() => null)
      .finally(() => {
        entry.inflight = null;
      });
  }
  return entry.inflight;
}

export function agentSessionUsageSupported(tool: string): boolean {
  return Object.prototype.hasOwnProperty.call(USAGE_READERS, tool);
}

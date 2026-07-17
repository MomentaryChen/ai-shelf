import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import {
  FLOW_CHAT_DRAFT_ID,
  FLOW_CHAT_SCHEMA,
  type FlowChatMessage,
  type FlowChatState,
  type FlowPromptLogEntry,
} from "../shared/flow-chat-types.js";

function flowChatRoot(): string {
  return join(getAppDataDir(), "flow-chat");
}

export function flowChatDir(flowId: string): string {
  return join(flowChatRoot(), flowId);
}

function chatFilePath(flowId: string): string {
  return join(flowChatDir(flowId), "chat.json");
}

function promptsFilePath(flowId: string): string {
  return join(flowChatDir(flowId), "prompts.jsonl");
}

function ensureChatDir(flowId: string): string {
  const dir = flowChatDir(flowId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readFlowChat(flowId: string): FlowChatState | null {
  const path = chatFilePath(flowId);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as FlowChatState;
    if (data.schema !== FLOW_CHAT_SCHEMA) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveFlowChat(flowId: string, messages: FlowChatMessage[]): FlowChatState {
  ensureChatDir(flowId);
  const state: FlowChatState = {
    schema: FLOW_CHAT_SCHEMA,
    flowId,
    messages,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(chatFilePath(flowId), JSON.stringify(state, null, 2), "utf8");
  return state;
}

export function appendFlowPromptLog(flowId: string, entry: Omit<FlowPromptLogEntry, "t" | "flowId">): void {
  ensureChatDir(flowId);
  const line: FlowPromptLogEntry = {
    t: new Date().toISOString(),
    flowId,
    ...entry,
  };
  appendFileSync(promptsFilePath(flowId), `${JSON.stringify(line)}\n`, "utf8");
}

/** Patch cost fields onto the latest prompt log entry of the given kind. */
export function patchLatestFlowPromptLog(
  flowId: string,
  kind: FlowPromptLogEntry["kind"],
  patch: Pick<FlowPromptLogEntry, "costUsd" | "inputTokens" | "outputTokens">,
): void {
  const path = promptsFilePath(flowId);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i]?.trim();
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as FlowPromptLogEntry;
      if (entry.kind !== kind) continue;
      const next: FlowPromptLogEntry = { ...entry };
      if (patch.costUsd != null) next.costUsd = patch.costUsd;
      if (patch.inputTokens != null) next.inputTokens = patch.inputTokens;
      if (patch.outputTokens != null) next.outputTokens = patch.outputTokens;
      lines[i] = JSON.stringify(next);
      const body = lines.join("\n").replace(/\n+$/u, "");
      writeFileSync(path, body ? `${body}\n` : "", "utf8");
      return;
    } catch {
      /* skip malformed */
    }
  }
}

export function listFlowPromptLogs(flowId: string, limit = 50): FlowPromptLogEntry[] {
  const path = promptsFilePath(flowId);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const entries: FlowPromptLogEntry[] = [];
  for (const line of lines.slice(-limit)) {
    try {
      entries.push(JSON.parse(line) as FlowPromptLogEntry);
    } catch {
      /* skip malformed */
    }
  }
  return entries;
}

function rewritePromptLogFlowIds(flowId: string): void {
  const promptsPath = promptsFilePath(flowId);
  if (!existsSync(promptsPath)) return;
  const lines = readFileSync(promptsPath, "utf8").split(/\r?\n/).filter(Boolean);
  const updated = lines
    .map((line) => {
      try {
        const entry = JSON.parse(line) as FlowPromptLogEntry;
        return JSON.stringify({ ...entry, flowId });
      } catch {
        return line;
      }
    })
    .join("\n");
  writeFileSync(promptsPath, updated ? `${updated}\n` : "", "utf8");
}

function promptLogFingerprint(entry: FlowPromptLogEntry): string {
  return `${entry.t}|${entry.kind}|${entry.prompt?.length ?? 0}|${entry.costUsd ?? ""}|${entry.runId ?? ""}`;
}

function appendPromptLogFile(fromFlowId: string, toFlowId: string): void {
  const fromPath = promptsFilePath(fromFlowId);
  if (!existsSync(fromPath)) return;
  const fromLines = readFileSync(fromPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (fromLines.length === 0) return;
  ensureChatDir(toFlowId);

  const toPath = promptsFilePath(toFlowId);
  const seen = new Set<string>();
  if (existsSync(toPath)) {
    for (const line of readFileSync(toPath, "utf8").split(/\r?\n/).filter(Boolean)) {
      try {
        seen.add(promptLogFingerprint(JSON.parse(line) as FlowPromptLogEntry));
      } catch {
        seen.add(line);
      }
    }
  }

  const rewritten: string[] = [];
  for (const line of fromLines) {
    try {
      const entry = { ...(JSON.parse(line) as FlowPromptLogEntry), flowId: toFlowId };
      const fp = promptLogFingerprint(entry);
      if (seen.has(fp)) continue;
      seen.add(fp);
      rewritten.push(JSON.stringify(entry));
    } catch {
      if (seen.has(line)) continue;
      seen.add(line);
      rewritten.push(line);
    }
  }
  if (rewritten.length === 0) return;
  appendFileSync(toPath, `${rewritten.join("\n")}\n`, "utf8");
}

export function migrateFlowChat(fromFlowId: string, toFlowId: string): void {
  if (fromFlowId === toFlowId) return;
  const fromDir = flowChatDir(fromFlowId);
  const toDir = flowChatDir(toFlowId);
  if (!existsSync(fromDir)) return;

  mkdirSync(flowChatRoot(), { recursive: true });

  if (existsSync(toDir)) {
    // Overwrite / re-save: keep existing chat + prompts, merge draft session on top.
    const fromChat = readFlowChat(fromFlowId);
    const toChat = readFlowChat(toFlowId);
    if (fromChat?.messages?.length) {
      const existingIds = new Set((toChat?.messages ?? []).map((m) => m.id));
      const merged = [
        ...(toChat?.messages ?? []),
        ...fromChat.messages.filter((m) => !existingIds.has(m.id)),
      ];
      saveFlowChat(toFlowId, merged.map((m) => ({ ...m })));
    }
    appendPromptLogFile(fromFlowId, toFlowId);
    rmSync(fromDir, { recursive: true, force: true });
    return;
  }

  renameSync(fromDir, toDir);

  const chat = readFlowChat(toFlowId);
  if (chat) {
    saveFlowChat(toFlowId, chat.messages.map((m) => ({ ...m })));
  }
  rewritePromptLogFlowIds(toFlowId);
}

export function deleteFlowChatData(flowId: string): void {
  const dir = flowChatDir(flowId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function deleteRunsForFlow(flowId: string): void {
  const runsRoot = join(getAppDataDir(), "runs");
  if (!existsSync(runsRoot)) return;
  const suffix = `-${flowId}`;
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith(suffix)) continue;
    rmSync(join(runsRoot, entry.name), { recursive: true, force: true });
  }
}

export { FLOW_CHAT_DRAFT_ID };

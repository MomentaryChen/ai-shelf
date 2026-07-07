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

export function migrateFlowChat(fromFlowId: string, toFlowId: string): void {
  if (fromFlowId === toFlowId) return;
  const fromDir = flowChatDir(fromFlowId);
  const toDir = flowChatDir(toFlowId);
  if (!existsSync(fromDir)) return;

  if (existsSync(toDir)) {
    rmSync(toDir, { recursive: true, force: true });
  }
  mkdirSync(flowChatRoot(), { recursive: true });
  renameSync(fromDir, toDir);

  const chat = readFlowChat(toFlowId);
  if (chat) {
    saveFlowChat(toFlowId, chat.messages.map((m) => ({ ...m })));
  }

  const promptsPath = promptsFilePath(toFlowId);
  if (existsSync(promptsPath)) {
    const lines = readFileSync(promptsPath, "utf8").split(/\r?\n/).filter(Boolean);
    const updated = lines
      .map((line) => {
        try {
          const entry = JSON.parse(line) as FlowPromptLogEntry;
          return JSON.stringify({ ...entry, flowId: toFlowId });
        } catch {
          return line;
        }
      })
      .join("\n");
    writeFileSync(promptsPath, updated ? `${updated}\n` : "", "utf8");
  }
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

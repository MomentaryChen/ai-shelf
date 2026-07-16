export const FLOW_CHAT_SCHEMA = "ai-shelf.flow/chat/v1" as const;

export const FLOW_CHAT_DRAFT_ID = "__draft__" as const;

export type FlowChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  draft?: string;
  error?: boolean;
  createdAt: string;
};

export type FlowChatState = {
  schema: typeof FLOW_CHAT_SCHEMA;
  flowId: string;
  messages: FlowChatMessage[];
  updatedAt: string;
};

export type FlowPromptLogKind = "generate" | "run";

export type FlowPromptLogEntry = {
  t: string;
  kind: FlowPromptLogKind;
  flowId: string;
  runId?: string;
  inputFormat: "text" | "arg";
  prompt: string;
  cliArgs?: string[];
};

export type AuthStatus = "ok" | "missing" | "expired" | "unknown";

export interface MCPInfo {
  supported: boolean;
  servers: string[];
  configPaths: string[];
}

export interface Capabilities {
  contextTokens?: number;
  streaming: boolean;
  toolCalls: boolean;
  vision?: boolean;
}

export interface ConfigInfo {
  paths: string[];
  instructionFiles: string[];
}

export interface ProviderEntry {
  tool: string;
  provider: string;
  version?: string;
  available: boolean;
  model?: string;
  models?: string[];
  auth: AuthStatus;
  skills: string[];
  mcp: MCPInfo;
  capabilities: Capabilities;
  config: ConfigInfo;
  recommendation?: string;
}

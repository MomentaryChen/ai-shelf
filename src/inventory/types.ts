export type AuthStatus = "ok" | "missing" | "expired" | "unknown";

/** Detection options — `quick` skips remote model list fetches for faster first paint. */
export interface DetectOptions {
  quick?: boolean;
}

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

export type SkillScope = "global" | "project" | "config";

/** A discovered agent skill from a SKILL.md file on disk. */
export interface SkillEntry {
  name: string;
  description?: string;
  path: string;
  scope: SkillScope;
}

export interface ProviderEntry {
  tool: string;
  provider: string;
  version?: string;
  available: boolean;
  model?: string;
  models?: string[];
  auth: AuthStatus;
  /** Skill names from scanned SKILL.md files (empty when none found). */
  skills: string[];
  /** Full scan metadata; omitted when identical to `skills` only. */
  skillDetails?: SkillEntry[];
  mcp: MCPInfo;
  capabilities: Capabilities;
  config: ConfigInfo;
  recommendation?: string;
}

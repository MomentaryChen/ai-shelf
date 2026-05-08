/** Types mirroring the inventory data from the main process. */

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

export interface DoctorCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface DoctorResult {
  tool: string;
  checks: DoctorCheck[];
}

export interface ToolUpdateInfo {
  tool: string;
  label: string;
  currentVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  updateCommand: string;
}

export interface UpdateCheckResult {
  tools: ToolUpdateInfo[];
}

export interface UpdateRunResult {
  success: boolean;
  message: string;
}

export interface McpRawData {
  [tool: string]: {
    servers: Record<string, Record<string, unknown>>;
    configPath: string;
  };
}

export interface McpSyncResult {
  tool: string;
  added: string[];
  skipped: string[];
  error?: string;
}

export interface EnvVar {
  key: string;
  set: boolean;
  value?: string;
}

export interface EnvVarGroup {
  provider: string;
  vars: EnvVar[];
}

export interface ElectronAPI {
  getInventory: () => Promise<ProviderEntry[]>;
  runDoctor: () => Promise<DoctorResult[]>;
  runDoctorTool: (tool: string) => Promise<DoctorResult>;
  checkUpdate: () => Promise<UpdateCheckResult>;
  getSelfInfo: () => Promise<{ version: string; updateCommand: string }>;
  getToolsList: () => Promise<UpdateCheckResult>;
  checkToolLatest: (tool: string) => Promise<{ tool: string; latestVersion: string | null }>;
  startUpdateScan: () => Promise<void>;
  onToolDetected: (cb: (data: ToolUpdateInfo) => void) => void;
  onToolLatest: (cb: (data: { tool: string; latestVersion: string | null }) => void) => void;
  onScanComplete: (cb: () => void) => void;
  offScanListeners: () => void;
  runUpdate: (tool: string) => Promise<UpdateRunResult>;
  getMcpRaw: () => Promise<McpRawData>;
  syncMcp: (opts: { serverNames: string[]; targetTools: string[] }) => Promise<McpSyncResult[]>;
  openPath: (filePath: string) => Promise<void>;
  launchInTerminal: (tool: string, terminal?: string, cwd?: string) => Promise<{ success: boolean; error?: string }>;
  ptySpawn:  (tool: string, cwd?: string)                           => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  pickFolder: (defaultPath?: string)                                => Promise<string | null>;
  ptyWrite:  (sessionId: string, data: string)             => void;
  ptyResize: (sessionId: string, cols: number, rows: number) => void;
  ptyKill:   (sessionId: string)                           => void;
  onPtyData: (cb: (p: { sessionId: string; data: string })     => void) => (() => void);
  onPtyExit: (cb: (p: { sessionId: string; exitCode: number }) => void) => (() => void);
  setDefaultModel: (tool: string, model: string) => Promise<{ success: boolean; error?: string }>;
  getEnvVars: () => Promise<EnvVarGroup[]>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

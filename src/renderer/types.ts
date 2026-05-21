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

export interface WorkspaceInfo {
  id: string;
  name: string;
  root_path: string | null;
}

export interface GroupInfo {
  id: string;
  workspace_id: string;
  name: string;
}

export interface SessionInfo {
  id: string;
  workspace_id: string;
  group_id: string;
  name: string;
  cwd: string;
  shell: string;
  tool: string | null;
  pid: number | null;
  status: string;
}

export interface GroupLayoutMeta {
  paneCount: number;
  defaultCwd: string;
  updatedAt: string;
}

export interface GroupLayoutSnapshot {
  defaultCwd: string;
  panes: { tool: string; cwd: string; title?: string }[];
  layout: unknown;
  broadcastInput?: boolean;
  accentColor?: string | null;
  updatedAt: string;
}

export interface ProfileTerminal {
  tool: string;
  cwd: string;
  title?: string;
}

export interface ProfileInfo {
  id: string;
  workspaceId: string;
  name: string;
  defaultCwd: string;
  defaultTool: string;
  broadcastInput: boolean;
  accentColor: string | null;
  paneCount: number;
  terminals: ProfileTerminal[];
  updatedAt: string | null;
}

export interface ProfileTree {
  workspaceId: string;
  profiles: ProfileInfo[];
  lastActiveProfileId: string | null;
}

export interface WorkspaceTree {
  workspaces: WorkspaceInfo[];
  groups: Record<string, GroupInfo[]>;
  sessions: Record<string, SessionInfo[]>;
  groupLayouts?: Record<string, GroupLayoutMeta>;
  lastActiveGroupKey?: string | null;
}

export interface PtySearchHit {
  line: number;
  col: number;
  size: number;
  lineText: string;
  before: string;
  after: string;
}

export interface PtySearchResult {
  matches: PtySearchHit[];
  total: number;
  capped: boolean;
}

export interface ElectronAPI {
  getInventory: () => Promise<ProviderEntry[]>;
  startInventoryScan: () => Promise<void>;
  clearInventoryCache: () => Promise<void>;
  onInventoryEntry: (cb: (entry: ProviderEntry) => void) => void;
  onInventoryEnriched: (cb: (entry: ProviderEntry) => void) => void;
  onInventoryComplete: (cb: (payload: { count: number }) => void) => void;
  offInventoryListeners: () => void;
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
  ptyAttach: (sessionId: string)                                    => Promise<{ success: boolean; alive: boolean; buffer: string }>;
  ptyGetOutputBuffer: (sessionId: string)                            => Promise<{ buffer: string }>;
  ptySearchOutput: (
    sessionId: string,
    query: string,
    opts?: { caseSensitive?: boolean; maxMatches?: number; contextChars?: number },
  ) => Promise<PtySearchResult>;
  ptyGetLogPath: (sessionId: string)                                => Promise<{ path: string }>;
  pickFolder: (defaultPath?: string)                                => Promise<string | null>;
  clipboardReadText: ()                                             => Promise<string>;
  clipboardWriteText: (text: string)                                => Promise<void>;
  ptyWrite:  (sessionId: string, data: string)             => void;
  ptyResize: (sessionId: string, cols: number, rows: number) => void;
  ptyKill:   (sessionId: string)                           => void;
  onPtyData: (cb: (p: { sessionId: string; data: string })     => void) => (() => void);
  onPtyExit: (cb: (p: { sessionId: string; exitCode: number }) => void) => (() => void);
  setDefaultModel: (tool: string, model: string) => Promise<{ success: boolean; error?: string }>;
  getEnvVars: () => Promise<EnvVarGroup[]>;
  wsGetTree: () => Promise<WorkspaceTree>;
  wsWorkspaceCreate: (name: string, rootPath?: string) => Promise<{ success: boolean; error?: string }>;
  wsGroupCreate: (workspace: string, group: string) => Promise<{ success: boolean; error?: string }>;
  wsSessionCreate: (
    workspace: string,
    group: string,
    name: string,
    opts?: { cwd?: string; tool?: string },
  ) => Promise<{ success: boolean; error?: string }>;
  wsSessionStop: (
    workspace: string,
    group: string,
    name: string,
  ) => Promise<{ success: boolean; error?: string }>;
  wsGroupLayoutGet: (
    workspaceId: string,
    groupId: string,
  ) => Promise<{ success: boolean; snapshot?: GroupLayoutSnapshot | null; error?: string }>;
  wsGroupLayoutSave: (
    workspaceId: string,
    groupId: string,
    snapshot: GroupLayoutSnapshot,
  ) => Promise<{ success: boolean; snapshot?: GroupLayoutSnapshot; error?: string }>;
  wsGroupLayoutSetActive: (
    workspaceId: string,
    groupId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  profileGetTree: () => Promise<{ success: boolean; tree?: ProfileTree; error?: string }>;
  profileCreate: (
    name: string,
    defaultCwd?: string,
    defaultTool?: string,
    accentColor?: string | null,
  ) => Promise<{ success: boolean; profile?: ProfileInfo; error?: string }>;
  profileUpdate: (
    profileId: string,
    patch: {
      name?: string;
      defaultCwd?: string;
      defaultTool?: string;
      broadcastInput?: boolean;
      accentColor?: string | null;
    },
  ) => Promise<{ success: boolean; profile?: ProfileInfo; error?: string }>;
  profileDelete: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  profileReorder: (
    orderedProfileIds: string[],
  ) => Promise<{ success: boolean; tree?: ProfileTree; error?: string }>;
  openChatWindow: () => Promise<void>;
  openSettingsWindow: () => Promise<void>;
  toggleDevTools: () => Promise<void>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

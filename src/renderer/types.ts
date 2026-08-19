/** Types mirroring the inventory data from the main process. */

import type { AuthSessionReport, AuthStatePublic } from "../shared/auth-types.js";
import type { CloudSyncStateDoc, SyncBundle, SyncMeta, SyncStatus } from "../shared/sync-types.js";

import type { FlowChatMessage, FlowPromptLogEntry } from "../shared/flow-chat-types.js";
import type { FlowRunArtifact, FlowRunEvent } from "../shared/flow-run-types.js";
import type {
  FlowConsoleBufferSnapshot,
  FlowConsoleChunk,
} from "../shared/flow-console-types.js";
import type { FlowListItem, FlowRunState } from "../shared/flow-types.js";
import type { FlowTemplateCatalogEntry } from "../shared/flow-template-catalog.js";
import type { FlowDagNodeCommandDetail } from "../flow/flow-command-preview.js";

export type { AuthSessionReport, AuthStatePublic, AuthUserPublic } from "../shared/auth-types.js";
export type { SyncBundle, SyncMeta, SyncStatus } from "../shared/sync-types.js";
export type { FlowChatMessage, FlowPromptLogEntry } from "../shared/flow-chat-types.js";
export type { FlowRunArtifact, FlowRunEvent } from "../shared/flow-run-types.js";
export type { FlowListItem, FlowRunState } from "../shared/flow-types.js";
export type { FlowDagNodeCommandDetail } from "../flow/flow-command-preview.js";

export type FlowTemplateListItem = FlowTemplateCatalogEntry & { installed: boolean };

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

export type SkillScope = "global" | "project" | "config";

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
  skills: string[];
  skillDetails?: SkillEntry[];
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
  desktopUpdate?: boolean;
}

export interface AppUpdateChannelInfo {
  isPackaged: boolean;
  desktopAutoUpdate: boolean;
}

export interface AppUpdateAvailablePayload {
  version: string | null;
  releaseNotes: string | null;
}

export interface AppUpdateProgressPayload {
  percent: number;
  transferred?: number;
  total?: number;
}

export interface AppUpdateStatePayload {
  status: string;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  error: string | null;
  downloadPercent: number;
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

export type McpSyncPreviewAction = "add" | "skip" | "conflict" | "blocked";

export interface McpSyncPreviewItem {
  serverName: string;
  targetTool: string;
  action: McpSyncPreviewAction;
  sourceTool?: string;
  incomingJson?: string;
  existingJson?: string;
  reason?: string;
}

export interface TeamPolicy {
  version: 1;
  name?: string;
  sourceOfTruth?: {
    mcp?: string;
    skills?: string;
  };
  mcp?: {
    required?: string[];
    forbidden?: string[];
  };
  skills?: {
    required?: string[];
    forbidden?: string[];
  };
}

export type PolicyViolationKind =
  | "mcp-forbidden"
  | "mcp-required"
  | "skill-forbidden"
  | "skill-required";

export interface PolicyViolation {
  kind: PolicyViolationKind;
  name: string;
  tool: string;
}

export interface ConfigAlignGap {
  kind: "mcp" | "skill";
  name: string;
  sourceTool: string;
  missingIn: string[];
}

export type HealthAlertKind = "update" | "doctor-fail" | "doctor-warn" | "auth";

export interface HealthAlert {
  id: string;
  kind: HealthAlertKind;
  severity: "warn" | "fail";
  tool?: string;
  message: string;
}

export interface HealthMonitorPrefs {
  backgroundChecksEnabled: boolean;
  trayBadgeEnabled: boolean;
  weeklyDoctorSummary: boolean;
}

export interface HealthMonitorState {
  lastCheckAt: string | null;
  lastWeeklySummaryAt: string | null;
  checking: boolean;
  alerts: HealthAlert[];
  outdatedTools: { tool: string; current: string; latest: string }[];
  doctorSummary: { failCount: number; warnCount: number; tools: string[] };
  prefs: HealthMonitorPrefs;
}

export interface SkillsRawData {
  [tool: string]: {
    skills: Record<string, { name: string; description?: string; path: string; scope: string }>;
    writeRoot: string | null;
  };
}

export type SkillSyncResult = McpSyncResult;

export interface ConfigAlignResult {
  mcpSource: string;
  skillsSource: string;
  mcpResults: McpSyncResult[];
  skillResults: SkillSyncResult[];
}

export type McpConfigFormat = "json" | "toml" | "unknown";

export interface McpServerRecord {
  name: string;
  entry: Record<string, unknown>;
  enabled: boolean;
}

export interface McpListResult {
  tool: string;
  configPath: string;
  format: McpConfigFormat;
  supported: boolean;
  servers: McpServerRecord[];
  error?: string;
}

export interface McpEditResult {
  success: boolean;
  error?: string;
}

export type McpRegistryTransport = "stdio" | "remote";

export interface McpRegistryServerItem {
  id: string;
  title?: string;
  description?: string;
  version: string;
  transport: McpRegistryTransport;
  websiteUrl?: string;
  repositoryUrl?: string;
}

export interface McpRegistryListResult {
  servers: McpRegistryServerItem[];
  nextCursor?: string;
  error?: string;
}

export interface McpRegistryEnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
}

export interface McpRegistryArg {
  name: string;
  description?: string;
  isRequired?: boolean;
  default?: string;
  type?: string;
}

export interface McpRegistryInstallPreview {
  registryId: string;
  suggestedName: string;
  title?: string;
  description?: string;
  transport: McpRegistryTransport;
  entry: Record<string, unknown>;
  envVars: McpRegistryEnvVar[];
  packageArgs: McpRegistryArg[];
}

export type McpTransport = "stdio" | "http" | "unknown";

export interface McpPingResult {
  name: string;
  ok: boolean;
  transport: McpTransport;
  serverName?: string;
  serverVersion?: string;
  error?: string;
  durationMs: number;
}

export interface McpPingToolResult {
  tool: string;
  configPath: string;
  results: McpPingResult[];
}

export interface ConfigFileReadResult {
  success: boolean;
  content: string;
  exists: boolean;
  error?: string;
}

export interface ConfigSnapshotSummary {
  id: string;
  label: string;
  createdAt: string;
  appVersion: string;
  fileCount: number;
  skillCount: number;
}

export type ConfigSnapshotDiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface ConfigSnapshotDiffItem {
  archiveKey: string;
  kind: "file" | "skill";
  status: ConfigSnapshotDiffStatus;
  absolutePathA?: string;
  absolutePathB?: string;
  skillName?: string;
  preview?: string;
}

export interface ConfigSnapshotDiffResult {
  snapshotA: ConfigSnapshotSummary;
  snapshotB: ConfigSnapshotSummary;
  items: ConfigSnapshotDiffItem[];
}

export interface ConfigSnapshotManifest extends ConfigSnapshotSummary {
  formatVersion: number;
  sourceHome?: string;
  entries: unknown[];
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
  savedCommands?: SavedCommandSnippet[];
  updatedAt: string;
}

export interface SavedCommandSnippet {
  id: string;
  name: string;
  command: string;
  broadcast?: boolean;
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
  savedCommands: SavedCommandSnippet[];
  updatedAt: string | null;
}

export interface ProfileTree {
  workspaceId: string;
  profiles: ProfileInfo[];
  lastActiveProfileId: string | null;
}

export interface ProfileGroupInfo {
  id: string;
  name: string;
  profileCount: number;
  updatedAt: string | null;
}

export interface ProfileGroupNode extends ProfileGroupInfo {
  profiles: ProfileInfo[];
}

export interface ProfileForest {
  groups: ProfileGroupNode[];
  lastActiveGroupId: string | null;
  lastActiveProfileId: string | null;
  /** Last opened profile id keyed by profile group id. */
  lastActiveByGroup: Record<string, string>;
}

export interface ProfileCreateInput {
  groupId?: string;
  groupName?: string;
  defaultCwd?: string;
  defaultTool?: string;
  accentColor?: string | null;
  broadcastInput?: boolean;
  copyFromProfileId?: string;
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

export type UsageToolId = "claude" | "codex" | "cursor" | "gemini" | "copilot";

export interface UsageCredentialFieldMeta {
  key: string;
  label: string;
  labelKey?: string;
  groupKey?: string;
  groupLabelKey?: string;
  noteKey?: string;
  placeholder?: string;
  helpUrl?: string;
  helpLinkKey?: string;
}

export interface UsageProviderMeta {
  toolId: UsageToolId;
  label: string;
  supported: boolean;
  unsupportedReason?: string;
  credentialNoteKey?: string;
  docsUrl?: string;
  fields: UsageCredentialFieldMeta[];
}

export interface UsageCredentialStatus {
  toolId: UsageToolId;
  configured: boolean;
  maskedHint?: string;
  methods?: Array<{ fieldKey: string; labelKey: string; maskedHint?: string }>;
}

export interface UsageDayBucket {
  date: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface UsageDailyToolSlice {
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface UsageDailyUnifiedRow {
  date: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  byTool: Partial<Record<UsageToolId, UsageDailyToolSlice>>;
}

export interface UsageModelBreakdown {
  model: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface UsageQuotaWindow {
  key: string;
  labelKey: string;
  label?: string;
  usedPercent: number;
  resetAt?: string;
  usedUsd?: number;
  limitUsd?: number;
  remainingUsd?: number;
}

export interface UsageToolSnapshot {
  toolId: UsageToolId;
  label: string;
  status: "ok" | "not_configured" | "unsupported" | "error";
  error?: string;
  authSourceKey?: string;
  totalCostUsd?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  daily: UsageDayBucket[];
  byModel?: UsageModelBreakdown[];
  quotas?: UsageQuotaWindow[];
}

export interface UsageAttributionRow {
  id: string;
  label: string;
  costUsd: number;
  runCount: number;
  estimated: boolean;
  toolId?: UsageToolId;
  durationMs: number;
}

export interface UsageHottestFlow {
  flowId: string;
  label: string;
  costUsd: number;
  runCount: number;
  estimated: boolean;
}

export interface UsageBudgetAlert {
  level: "ok" | "warn" | "over";
  weekSpendUsd: number;
  weeklyBudgetUsd: number | null;
  alertAtPercent: number;
  usedPercent: number;
  messageKey: "usage.budget.ok" | "usage.budget.warn" | "usage.budget.over" | "usage.budget.quotaWarn";
  quotaAlerts: Array<{
    toolId: UsageToolId;
    labelKey: string;
    label?: string;
    usedPercent: number;
  }>;
}

export interface UsageBudgetPrefs {
  weeklyBudgetUsd: number | null;
  alertAtPercent: number;
}

export interface UsageCostInsights {
  byTool: UsageAttributionRow[];
  byProfile: UsageAttributionRow[];
  byFlow: UsageAttributionRow[];
  hottestFlow: UsageHottestFlow | null;
  weekHottestFlow: UsageHottestFlow | null;
  weekSpendUsd: number;
  budget: UsageBudgetPrefs;
  alert: UsageBudgetAlert;
}

export interface UsageDashboardResult {
  rangeDays: number;
  fetchedAt: string;
  encryptionAvailable: boolean;
  tools: UsageToolSnapshot[];
  summary: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    configuredCount: number;
    supportedCount: number;
    dailyUnified: UsageDailyUnifiedRow[];
  };
  insights: UsageCostInsights;
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
  getSelfInfo: () => Promise<{
    version: string;
    updateCommand: string;
    desktopUpdate?: boolean;
    branch: string | null;
    commitShort: string | null;
    dirty: boolean;
  }>;
  getAppUpdateChannel: () => Promise<AppUpdateChannelInfo>;
  checkAppUpdate: () => Promise<AppUpdateStatePayload>;
  getAppUpdateState: () => Promise<AppUpdateStatePayload>;
  confirmAppUpdateDownload: () => Promise<{ ok: boolean }>;
  quitAndInstallAppUpdate: () => Promise<{ ok: boolean }>;
  onAppUpdateAvailable: (cb: (payload: AppUpdateAvailablePayload) => void) => () => void;
  onAppUpdateNotAvailable: (cb: (payload: { version: string | null }) => void) => () => void;
  onAppUpdateProgress: (cb: (payload: AppUpdateProgressPayload) => void) => () => void;
  onAppUpdateDownloaded: (cb: (payload: { version: string | null }) => void) => () => void;
  onAppUpdateError: (cb: (payload: { message: string }) => void) => () => void;
  getToolsList: () => Promise<UpdateCheckResult>;
  checkToolLatest: (tool: string) => Promise<ToolUpdateInfo | null>;
  refreshToolUpdateInfo: (tool: string) => Promise<ToolUpdateInfo | null>;
  startUpdateScan: () => Promise<void>;
  onToolDetected: (cb: (data: ToolUpdateInfo) => void) => void;
  onToolLatest: (cb: (data: { tool: string; latestVersion: string | null }) => void) => void;
  onScanComplete: (cb: () => void) => void;
  offScanListeners: () => void;
  runUpdate: (tool: string) => Promise<UpdateRunResult>;
  runInstall: (tool: string) => Promise<UpdateRunResult>;
  getMcpRaw: () => Promise<McpRawData>;
  syncMcp: (opts: {
    serverNames: string[];
    targetTools: string[];
    sourceTool?: string;
  }) => Promise<McpSyncResult[]>;
  previewMcpSync: (opts: {
    serverNames: string[];
    targetTools: string[];
    sourceTool?: string;
  }) => Promise<McpSyncPreviewItem[]>;
  getTeamPolicy: () => Promise<{ policy: TeamPolicy; path: string }>;
  setTeamPolicy: (
    policy: TeamPolicy,
  ) => Promise<{ ok: boolean; policy: TeamPolicy; path: string; error?: string }>;
  evaluateTeamPolicy: () => Promise<{
    policy: TeamPolicy;
    path: string;
    violations: PolicyViolation[];
  }>;
  getConfigAlignGaps: (opts?: {
    mcpSourceTool?: string;
    skillsSourceTool?: string;
    mcpTargets?: string[];
    skillTargets?: string[];
  }) => Promise<{
    policy: TeamPolicy;
    gaps: ConfigAlignGap[];
    mcpSource: string;
    skillsSource: string;
  }>;
  alignConfigFromSource: (opts?: {
    mcpSourceTool?: string;
    skillsSourceTool?: string;
    mcpTargets?: string[];
    skillTargets?: string[];
    syncMcp?: boolean;
    syncSkills?: boolean;
  }) => Promise<ConfigAlignResult>;
  importTeamPolicy: () => Promise<{
    ok: boolean;
    policy: TeamPolicy;
    path: string;
    canceled?: boolean;
    error?: string;
  }>;
  exportTeamPolicy: () => Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
  getHealthMonitorState: () => Promise<HealthMonitorState>;
  runHealthCheck: () => Promise<HealthMonitorState>;
  setHealthMonitorPrefs: (
    partial: Partial<HealthMonitorPrefs>,
  ) => Promise<{ ok: boolean; prefs: HealthMonitorPrefs }>;
  onHealthMonitorState: (cb: (state: HealthMonitorState) => void) => () => void;
  getSkillsRaw: () => Promise<SkillsRawData>;
  syncSkills: (opts: {
    skillNames: string[];
    targetTools: string[];
    sourceTool?: string;
  }) => Promise<SkillSyncResult[]>;
  readConfigFile: (filePath: string) => Promise<ConfigFileReadResult>;
  writeConfigFile: (filePath: string, content: string) => Promise<McpEditResult>;
  mcpListServers: (tool: string) => Promise<McpListResult>;
  mcpUpsertServer: (
    tool: string,
    name: string,
    entry: Record<string, unknown>,
    enabled: boolean,
  ) => Promise<McpEditResult>;
  mcpDeleteServer: (tool: string, name: string) => Promise<McpEditResult>;
  mcpSetServerEnabled: (tool: string, name: string, enabled: boolean) => Promise<McpEditResult>;
  mcpRegistryList: (opts: {
    search?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<McpRegistryListResult>;
  mcpRegistryPreview: (
    tool: string,
    registryId: string,
    values?: { env?: Record<string, string>; packageArgs?: Record<string, string> },
  ) => Promise<McpRegistryInstallPreview | { error: string }>;
  mcpPingTool: (tool: string) => Promise<McpPingToolResult>;
  openPath: (filePath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  launchInTerminal: (
    tool: string,
    terminal?: string,
    cwd?: string,
    extraArgs?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  ptySpawn: (
    tool: string,
    cwd?: string,
    extraArgs?: string,
    /** Embedded PTY shell preference: auto | pwsh | powershell | cmd | bash | zsh | fish | sh. */
    shell?: string,
  ) => Promise<{ success: boolean; sessionId?: string; cwd?: string; error?: string }>;
  ptyAttach: (
    sessionId: string,
    opts?: { includeBuffer?: boolean },
  ) => Promise<{
    success: boolean;
    alive: boolean;
    buffer: string;
    pid: number | null;
    shell: string | null;
    cols: number | null;
    rows: number | null;
    exitCode: number | null;
  }>;
  ptyGetOutputBuffer: (sessionId: string)                            => Promise<{ buffer: string }>;
  ptyExportOutput: (
    sessionId: string,
    defaultName?: string,
  ) => Promise<
    | { success: true; path: string }
    | { success: false; canceled?: true; error?: string }
  >;
  ptySearchOutput: (
    sessionId: string,
    query: string,
    opts?: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxMatches?: number;
      contextChars?: number;
    },
  ) => Promise<PtySearchResult>;
  ptyGetLogPath: (sessionId: string)                                => Promise<{ path: string }>;
  pickFolder: (defaultPath?: string)                                => Promise<string | null>;
  clipboardReadText: ()                                             => Promise<string>;
  clipboardWriteText: (text: string)                                => Promise<boolean>;
  ptyWrite:  (sessionId: string, data: string)             => void;
  ptyResize: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>;
  ptyKill:   (sessionId: string)                           => void;
  onPtyData: (cb: (p: { sessionId: string; data: string })     => void) => (() => void);
  onPtyExit: (cb: (p: { sessionId: string; exitCode: number }) => void) => (() => void);
  onPtyMeta: (
    cb: (p: {
      sessionId: string;
      alive: boolean;
      pid: number | null;
      shell: string;
      cols: number;
      rows: number;
      exitCode: number | null;
    }) => void,
  ) => (() => void);
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
  profileGroupGetForest: () => Promise<{ success: boolean; forest?: ProfileForest; error?: string }>;
  getOnboardingCompleted: () => Promise<{ success: boolean; completed?: boolean; error?: string }>;
  setOnboardingCompleted: () => Promise<{ success: boolean; error?: string }>;
  profileGroupCreate: (
    name: string,
  ) => Promise<{ success: boolean; group?: ProfileGroupInfo; error?: string }>;
  profileGroupUpdate: (
    idOrName: string,
    newName: string,
  ) => Promise<{ success: boolean; group?: ProfileGroupInfo; error?: string }>;
  profileGroupDelete: (idOrName: string) => Promise<{ success: boolean; error?: string }>;
  profileGroupReorder: (
    orderedGroupIds: string[],
  ) => Promise<{ success: boolean; groups?: ProfileGroupInfo[]; error?: string }>;
  profileCreate: (
    name: string,
    input?: ProfileCreateInput,
  ) => Promise<{ success: boolean; profile?: ProfileInfo; error?: string }>;
  profileUpdate: (
    profileId: string,
    patch: {
      name?: string;
      defaultCwd?: string;
      defaultTool?: string;
      broadcastInput?: boolean;
      accentColor?: string | null;
      savedCommands?: SavedCommandSnippet[];
    },
  ) => Promise<{ success: boolean; profile?: ProfileInfo; error?: string }>;
  profileSetSavedCommands: (
    profileId: string,
    savedCommands: SavedCommandSnippet[],
  ) => Promise<{ success: boolean; profile?: ProfileInfo; error?: string }>;
  profileDelete: (profileId: string) => Promise<{ success: boolean; error?: string }>;
  profileReorder: (
    groupIdOrName: string,
    orderedProfileIds: string[],
  ) => Promise<{ success: boolean; forest?: ProfileForest; error?: string }>;
  exportBackup: (
    localStorage: Record<string, string>,
  ) => Promise<
    | { success: true; path: string }
    | { success: false; canceled?: true; error?: string }
  >;
  importBackup: () => Promise<
    | {
        success: true;
        localStorage: Record<string, string>;
        exportedAt: string;
        appVersion: string;
      }
    | { success: false; canceled?: true; error?: string }
  >;
  configSnapshotList: () => Promise<
    { success: true; snapshots: ConfigSnapshotSummary[] } | { success: false; error?: string; snapshots: [] }
  >;
  configSnapshotCreate: (
    label: string,
  ) => Promise<
    { success: true; snapshot: ConfigSnapshotManifest } | { success: false; error?: string }
  >;
  configSnapshotRestore: (
    id: string,
  ) => Promise<
    { success: true; snapshot: ConfigSnapshotManifest } | { success: false; error?: string }
  >;
  configSnapshotDelete: (id: string) => Promise<{ success: boolean; error?: string }>;
  configSnapshotDiff: (
    idA: string,
    idB: string,
  ) => Promise<
    { success: true; diff: ConfigSnapshotDiffResult } | { success: false; error?: string }
  >;
  configSnapshotExport: (
    id: string,
  ) => Promise<
    | { success: true; path: string }
    | { success: false; canceled?: true; error?: string }
  >;
  configSnapshotImport: (
    label?: string,
  ) => Promise<
    { success: true; snapshot: ConfigSnapshotManifest } | { success: false; canceled?: true; error?: string }
  >;
  relaunchApp: () => Promise<{ ok: boolean }>;
  setSystemTrayEnabled: (enabled: boolean) => Promise<{ ok: boolean; systemTrayEnabled: boolean }>;
  getSystemTrayEnabled: () => Promise<{ systemTrayEnabled: boolean }>;
  setPtyBufferMaxChars: (chars: number) => Promise<{ ok: boolean; terminalPtyBufferChars: number }>;
  getPtyBufferMaxChars: () => Promise<{ terminalPtyBufferChars: number }>;
  showPaneAgentNotification: (payload: {
    title: string;
    body: string;
    paneId?: string;
    silent?: boolean;
  }) => Promise<{ ok: boolean }>;
  setTrayPaneAttention: (count: number) => Promise<{ ok: boolean; count: number }>;
  openChatWindow: () => Promise<void>;
  openSettingsWindow: () => Promise<void>;
  notifySettingsChanged: () => Promise<{ ok: true }>;
  toggleDevTools: () => Promise<void>;
  onTrayActivateProfile: (cb: (profileId: string) => void) => () => void;
  onPaneAgentFocus: (cb: (paneId: string) => void) => () => void;
  onProfileLayoutFlush: (cb: () => void) => () => void;
  sendProfileLayoutFlushDone: () => void;
  usageGetProviders: () => Promise<{
    providers: UsageProviderMeta[];
    encryptionAvailable: boolean;
  }>;
  usageGetCredentialStatus: () => Promise<{
    statuses: UsageCredentialStatus[];
    encryptionAvailable: boolean;
  }>;
  usageSetCredential: (
    tool: UsageToolId,
    fieldKey: string,
    value: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  usageClearCredential: (tool: UsageToolId) => Promise<{ ok: boolean; error?: string }>;
  usageTestCredential: (tool: UsageToolId, fieldKey?: string) => Promise<{ ok: boolean; error?: string }>;
  usageFetchDashboard: (opts?: { days?: number }) => Promise<
    | { ok: true; dashboard: UsageDashboardResult }
    | { ok: false; error: string }
  >;
  usageGetBudget: () => Promise<{ budget: UsageBudgetPrefs }>;
  usageSetBudget: (partial: {
    weeklyBudgetUsd?: number | null;
    alertAtPercent?: number;
  }) => Promise<{ ok: true; budget: UsageBudgetPrefs } | { ok: false; error: string }>;
  authReportSession: (
    report: AuthSessionReport,
  ) => Promise<{ ok: true; state: AuthStatePublic } | { ok: false; error: string }>;
  authClearSession: () => Promise<{ ok: true; state: AuthStatePublic }>;
  authGetState: (configured: boolean) => Promise<AuthStatePublic>;
  authGetIdToken: () => Promise<{ ok: boolean; token: string | null }>;
  authNotifyTokenRefreshFailed: () => Promise<{ ok: true }>;
  authOpenGoogleWindow: () => Promise<{ ok: boolean; error?: string; state?: AuthStatePublic }>;
  authFinishGoogleWindow: (result: {
    ok: boolean;
    error?: string;
    state?: AuthStatePublic;
  }) => Promise<{ ok: true }>;
  onAuthStateChanged: (cb: (state: AuthStatePublic) => void) => () => void;
  onAuthRefreshTokenRequest: (cb: () => void) => () => void;
  onAuthOAuthNavigated: (cb: (url: string) => void) => () => void;
  syncExportLocal: () => Promise<{ ok: true; bundle: SyncBundle } | { ok: false; error: string }>;
  syncApplyBundle: (
    bundle: SyncBundle,
    options?: { replace?: boolean },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  syncGetMeta: () => Promise<SyncMeta>;
  syncSetMeta: (partial: Partial<SyncMeta>) => Promise<{ ok: true; meta: SyncMeta } | { ok: false; error: string }>;
  syncPullRemote: () => Promise<
    { ok: true; state: CloudSyncStateDoc | null } | { ok: false; error: string }
  >;
  syncPushRemote: (payload: {
    bundle: SyncBundle;
    revision: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onSyncDataApplied: (cb: () => void) => () => void;
  onSettingsChanged: (cb: () => void) => () => void;
  flowList: () => Promise<FlowListItem[]>;
  flowListActiveRuns: () => Promise<FlowRunState[]>;
  flowReadFile: (flowId: string) => Promise<{ content: string; path: string } | null>;
  flowReadRunOutput: (
    runId: string,
  ) => Promise<{ ok: boolean; content?: string; outputPath?: string; startedAt?: string; error?: string }>;
  flowGetLatestRunOutput: (flowId: string) => Promise<{
    runId: string;
    outputPath: string;
    startedAt: string;
    status: import("../shared/flow-types.js").FlowRunStatus;
  } | null>;
  flowRun: (
    flowId: string,
    options?: { globalToolLaunchArgs?: import("../tool-launch.js").ToolLaunchArgs },
  ) => Promise<{ ok: boolean; runId?: string; error?: string }>;
  flowCancelRun: (flowId: string) => Promise<{ ok: boolean; runId?: string; error?: string }>;
  flowApproveGate: (flowId: string) => Promise<{ ok: boolean; error?: string }>;
  flowRejectGate: (flowId: string) => Promise<{ ok: boolean; error?: string }>;
  flowGetTaskSchedulerStatus: () => Promise<{
    supported: boolean;
    installed: boolean;
    taskName: string;
    launcherPath?: string;
  }>;
  flowInstallTaskScheduler: () => Promise<{
    ok: boolean;
    error?: string;
    status?: { supported: boolean; installed: boolean; taskName: string; launcherPath?: string };
  }>;
  flowRemoveTaskScheduler: () => Promise<{
    ok: boolean;
    error?: string;
    status?: { supported: boolean; installed: boolean; taskName: string; launcherPath?: string };
  }>;
  flowGetRunState: (runId: string) => Promise<FlowRunState | null>;
  flowListRecentRuns: (limit?: number) => Promise<FlowRunState[]>;
  flowListRunsForFlow: (
    flowId: string,
    limit?: number,
    offset?: number,
  ) => Promise<{ items: FlowRunState[]; total: number }>;
  flowGetRunEvents: (runId: string) => Promise<FlowRunEvent[]>;
  flowGetConsoleBuffer: (runId: string) => Promise<FlowConsoleBufferSnapshot>;
  flowOpenRunArtifact: (
    runId: string,
    artifact: FlowRunArtifact,
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  flowOpenFlowsDir: () => Promise<void>;
  flowDelete: (flowId: string) => Promise<{ ok: boolean; error?: string }>;
  flowOpenFile: (flowId: string) => Promise<{ ok: boolean; error?: string; path?: string }>;
  flowGetSchedulePrefs: () => Promise<{ schedulerEnabled: boolean }>;
  flowSetSchedulePrefs: (partial: {
    schedulerEnabled?: boolean;
  }) => Promise<{ ok: boolean; prefs?: { schedulerEnabled: boolean }; error?: string }>;
  flowRunDue: () => Promise<{
    ok: boolean;
    result?: {
      checked: number;
      started: string[];
      skipped: string[];
      errors: { flowId: string; error: string }[];
    };
  }>;
  flowSaveSchedule: (
    flowId: string,
    patch: { schedule: string | null; timezone?: string | null },
  ) => Promise<{ ok: boolean; error?: string }>;
  flowSaveRunnerSettings: (
    flowId: string,
    patch: {
      tool: string;
      toolArgs: string | null;
      cwd: string | null;
      profile: string | null;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  flowGenerate: (
    turns: { role: "user" | "assistant"; content: string }[],
    flowId?: string,
  ) => Promise<{ ok: boolean; content?: string; error?: string }>;
  flowGetChat: (flowId: string) => Promise<FlowChatMessage[] | null>;
  flowSaveChat: (
    flowId: string,
    messages: FlowChatMessage[],
  ) => Promise<{ ok: boolean; error?: string }>;
  flowClearChat: (flowId: string) => Promise<{ ok: boolean; error?: string }>;
  flowListPromptLogs: (
    flowId: string,
    limit?: number,
  ) => Promise<FlowPromptLogEntry[]>;
  flowGetDagNodeCommand: (
    flowId: string,
    node: {
      kind: "trigger" | "phase" | "output";
      phaseId?: string;
      phaseLabel?: string;
      phaseMessage?: string | null;
    },
    options?: {
      runId?: string;
      outputPath?: string | null;
      globalToolLaunchArgs?: Record<string, string>;
    },
  ) => Promise<FlowDagNodeCommandDetail | { error: string }>;
  flowCreate: (
    content: string,
    overwriteOrOptions?: boolean | { overwrite?: boolean; migrateChatFromDraft?: boolean },
  ) => Promise<{ ok: boolean; flowId?: string; path?: string; error?: string }>;
  flowListTemplates: () => Promise<FlowTemplateListItem[]>;
  flowInstallTemplate: (
    templateId: string,
  ) => Promise<{ ok: boolean; flowId?: string; path?: string; error?: string }>;
  onFlowRunState: (cb: (state: FlowRunState) => void) => () => void;
  onFlowConsoleChunk: (cb: (chunk: FlowConsoleChunk) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

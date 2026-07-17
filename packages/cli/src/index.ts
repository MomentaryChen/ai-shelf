export { APP_NAME, APP_TITLE } from "./config/config.js";
export { getAppDataDir, getDatabasePath } from "./config/loader.js";
export { openDatabase } from "./database/db.js";
export { bootstrap, type AppContext } from "./infra/bootstrap.js";
export type { BroadcastExecResult, ExecResult } from "./services/exec-service.js";
export { PtyRuntime, TOOL_LAUNCH_CMD } from "./runtime/pty-runtime.js";
export {
  DEFAULT_PTY_SHELL,
  DEFAULT_PTY_WT_SESSION,
  NO_SUITABLE_SHELL_ERROR,
  buildPtyEnv,
  buildUnixPtySpawn,
  buildWindowsPtyCandidates,
  normalizePtyShellPreference,
  orderWindowsPtyCandidates,
  ptyShellFromExternalTerminal,
  resolvePtySpawnPlan,
  type PtyShellCandidate,
  type PtyShellPreference,
  type ResolvedPtySpawnPlan,
} from "./runtime/pty-shell.js";
export type { WorkspaceModel } from "./models/workspace.js";
export type { GroupModel } from "./models/group.js";
export type { SessionModel } from "./models/session.js";
export type { GroupLayoutSnapshot, GroupLayoutMeta, SerializedLayoutNode, SavedCommandSnippet } from "./models/group-layout.js";
export type {
  ProfileInfo,
  ProfileTree,
  ProfileForest,
  ProfileGroupNode,
  CreateProfileInput,
} from "./services/profile-service.js";
export { PROFILES_WORKSPACE_NAME, DEFAULT_PROFILE_TOOL } from "./services/profile-service.js";
export type { ProfileGroupInfo } from "./services/profile-group-service.js";
export {
  DEFAULT_PROFILE_GROUP_NAME,
  ProfileGroupService,
} from "./services/profile-group-service.js";

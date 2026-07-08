import { bootstrap, type AppContext, type CreateProfileInput, type GroupLayoutSnapshot } from "ai-shelf";
import { PREF_ONBOARDING_COMPLETED } from "../shared/onboarding-pref.js";

let ctx: AppContext | null = null;

export function getWorkspaceContext(): AppContext {
  if (!ctx) ctx = bootstrap();
  return ctx;
}

export function closeWorkspaceContext(): void {
  ctx?.close();
  ctx = null;
}

export function getWorkspaceTree() {
  const { sessionService, groupLayoutService } = getWorkspaceContext();
  const { workspaces, groups, sessions } = sessionService.getTree();

  return {
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      root_path: w.root_path,
    })),
    groups: Object.fromEntries(
      [...groups.entries()].map(([wsId, list]) => [
        wsId,
        list.map((g) => ({ id: g.id, workspace_id: g.workspace_id, name: g.name })),
      ]),
    ),
    sessions: Object.fromEntries(
      [...sessions.entries()].map(([wsId, list]) => [
        wsId,
        list.map((s) => ({
          id: s.id,
          workspace_id: s.workspace_id,
          group_id: s.group_id,
          name: s.name,
          cwd: s.cwd,
          shell: s.shell,
          tool: s.tool,
          pid: s.pid,
          status: s.status,
        })),
      ]),
    ),
    groupLayouts: groupLayoutService.getMetaMap(),
    lastActiveGroupKey: groupLayoutService.getLastActiveGroupKey(),
  };
}

export function getGroupLayout(workspaceId: string, groupId: string) {
  return getWorkspaceContext().groupLayoutService.get(workspaceId, groupId);
}

export function saveGroupLayout(workspaceId: string, groupId: string, snapshot: GroupLayoutSnapshot) {
  return getWorkspaceContext().groupLayoutService.save(workspaceId, groupId, snapshot);
}

export function setLastActiveGroup(workspaceId: string, groupId: string) {
  getWorkspaceContext().groupLayoutService.setLastActiveGroup(workspaceId, groupId);
}

export function getOnboardingCompleted(): boolean {
  return (
    getWorkspaceContext().groupLayoutService.getPreference(PREF_ONBOARDING_COMPLETED) === "1"
  );
}

export function setOnboardingCompleted(): void {
  getWorkspaceContext().groupLayoutService.setPreference(PREF_ONBOARDING_COMPLETED, "1");
}

export function getProfileForest() {
  return getWorkspaceContext().profileService.getForest();
}

/** @deprecated Use getProfileForest() */
export function getProfileTree() {
  return getWorkspaceContext().profileService.getTree();
}

export function createProfileGroup(name: string) {
  return getWorkspaceContext().profileGroupService.create(name);
}

export function updateProfileGroup(idOrName: string, newName: string) {
  return getWorkspaceContext().profileGroupService.rename(idOrName, newName);
}

export function deleteProfileGroup(idOrName: string) {
  const ctx = getWorkspaceContext();
  const ws = ctx.profileGroupService.resolve(idOrName);
  ctx.sessionService.stopAllInWorkspace(ws.name);
  ctx.profileGroupService.delete(idOrName);
}

export function reorderProfileGroups(orderedGroupIds: string[]) {
  return getWorkspaceContext().profileGroupService.reorder(orderedGroupIds);
}

export function createProfile(
  name: string,
  input?: CreateProfileInput & { groupId?: string; groupName?: string },
) {
  const ctx = getWorkspaceContext();
  const groupRef =
    input?.groupId ?? input?.groupName ?? ctx.profileService.defaultGroupIdOrName();
  const { groupId: _g, groupName: _n, ...profileInput } = input ?? {};
  return ctx.profileService.create(groupRef, name, profileInput);
}

export function updateProfile(
  profileId: string,
  patch: {
    name?: string;
    defaultCwd?: string;
    defaultTool?: string;
    broadcastInput?: boolean;
    accentColor?: string | null;
    savedCommands?: {
      id: string;
      name: string;
      command: string;
      broadcast?: boolean;
    }[];
  },
) {
  return getWorkspaceContext().profileService.update(profileId, {
    ...patch,
    savedCommands: patch.savedCommands?.map((s) => ({ ...s, broadcast: s.broadcast ?? false })),
  });
}

export function setProfileSavedCommands(
  profileId: string,
  savedCommands: {
    id: string;
    name: string;
    command: string;
    broadcast?: boolean;
  }[],
) {
  return getWorkspaceContext().profileService.setSavedCommands(
    profileId,
    savedCommands.map((s) => ({ ...s, broadcast: s.broadcast ?? false })),
  );
}

export function deleteProfile(profileId: string) {
  getWorkspaceContext().profileService.delete(profileId);
}

export function reorderProfiles(groupIdOrName: string, orderedProfileIds: string[]) {
  return getWorkspaceContext().profileService.reorder(groupIdOrName, orderedProfileIds);
}
